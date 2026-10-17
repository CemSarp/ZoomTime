import { hostFixture, id } from './group-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startSignaling } from '../src/signaling.ts';
import { SignalingClient, type NetworkStatus } from '../src/signaling-client.ts';
import type { ServerMessage } from '../src/protocol.ts';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
async function wait(predicate: () => boolean) {
  const end = Date.now() + 4000;
  while (!predicate()) { assert.ok(Date.now() < end, 'Expected real signaling state'); await new Promise(r => setTimeout(r, 10)); }
}
test('main-owned client authenticates, validates messages and reconnects after a host restart', async () => {
  const tokens = hostFixture(2);
  let server = await startSignaling(tokens, 0); const port = server.port;
  const messages: ServerMessage[] = [], statuses: NetworkStatus[] = [];
  const client = new SignalingClient(`ws://127.0.0.1:${port}/zoomtime`, tokens.members[1].token, m => messages.push(m), s => statuses.push(s));
  try {
    client.start(); await wait(() => messages.some(m => m.type === 'state' && m.selfId === id(2)));
    assert.equal(client.send({ v: 2, type: 'sync' }), true);
    await server.close(); await wait(() => statuses.at(-1)?.state === 'offline');
    server = await startSignaling(tokens, port); await wait(() => statuses.at(-1)?.state === 'online');
    assert.equal(server.coordinator.isOnline(id(2)), true);
  } finally { client.stop(); await server.close(); }
});
test('untrusted TLS is rejected before any authenticated WebSocket upgrade', async () => {
  const directory=mkdtempSync(join(tmpdir(),'zoomtime-tls-')), key=join(directory,'key.pem'), cert=join(directory,'cert.pem');
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  const server=createServer({key:readFileSync(key),cert:readFileSync(cert)}); let upgraded=false;
  server.on('upgrade',(_r,s)=>{upgraded=true;s.destroy();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const statuses:NetworkStatus[]=[];
  const client=new SignalingClient(`wss://127.0.0.1:${address.port}/zoomtime`,randomBytes(32).toString('base64url'),()=>{},s=>statuses.push(s));
  try {client.start();await wait(()=>statuses.at(-1)?.state==='error');assert.match(statuses.at(-1)!.message,/certificate/);assert.equal(upgraded,false);}
  finally {client.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('invalid authentication produces an actionable error without unbounded retries', async () => {
  const tokens = hostFixture(2);
  const server = await startSignaling(tokens, 0), statuses: NetworkStatus[] = [];
  const client = new SignalingClient(`ws://127.0.0.1:${server.port}/zoomtime`, randomBytes(32).toString('base64url'), () => {}, s => statuses.push(s));
  try { client.start(); await wait(() => statuses.at(-1)?.state === 'error'); assert.match(statuses.at(-1)!.message, /pair/i); }
  finally { client.stop(); await server.close(); }
});
test('a private proxy with an offline host reports network failure and keeps retrying', async () => {
  let requests=0;const server=createHttpServer();
  server.on('upgrade',(_request,socket)=>{requests++;socket.on('error',()=>{});socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const statuses:NetworkStatus[]=[];const client=new SignalingClient(`ws://127.0.0.1:${address.port}/zoomtime`,randomBytes(32).toString('base64url'),()=>{},s=>statuses.push(s));
  try{client.start();await wait(()=>statuses.some(s=>s.state==='offline'));await wait(()=>requests>=2);assert.equal(statuses.some(s=>s.state==='error'),false);}
  finally{client.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
