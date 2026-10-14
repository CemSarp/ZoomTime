import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startSignaling } from '../src/signaling.ts';
const token = () => randomBytes(32).toString('base64url');
const wait = async (predicate: () => boolean) => {
  const deadline = Date.now() + 2000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'Timed out waiting for actual socket behavior'); await new Promise(r => setTimeout(r, 5)); }
};
test('real loopback sockets authenticate roles and reject unauthorized, duplicate and browser clients', async () => {
  const tokens = { hostToken: token(), guestToken: token() }; const server = await startSignaling(tokens, 0);
  const sockets: WebSocket[] = [];
  try {
    assert.ok(server.port > 0);
    const connect = (credential: string, origin?: string) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`, { headers: { Authorization: `Bearer ${credential}` }, origin, perMessageDeflate: false });
      sockets.push(ws); ws.on('error', () => {}); return ws;
    };
    const denied = connect(token()); assert.match(String((await once(denied, 'error'))[0]), /401/);
    const host = connect(tokens.hostToken); await once(host, 'open'); await wait(() => server.coordinator.isOnline('host'));
    assert.equal(host.extensions, '');
    const duplicate = connect(tokens.hostToken); assert.match(String((await once(duplicate, 'error'))[0]), /409/);
    const browser = connect(tokens.guestToken, 'https://evil.test'); assert.match(String((await once(browser, 'error'))[0]), /403/);
    const guest = connect(tokens.guestToken); await once(guest, 'open'); await wait(() => server.coordinator.isOnline('guest'));
    host.send(JSON.stringify({ v: 1, type: 'request' })); await wait(() => server.coordinator.snapshot?.phase === 'ringing');
    const id = server.coordinator.snapshot!.id;
    guest.send(JSON.stringify({ v: 1, type: 'accept', callId: id })); await wait(() => server.coordinator.snapshot?.phase === 'connecting');
    server.coordinator.end('pairing-reset'); assert.equal(server.coordinator.snapshot, null);
  } finally { for (const ws of sockets) ws.terminate(); await server.close(); }
});
test('binary, oversized, malformed and excessive messages close only the offending connection', async () => {
  for (const kind of ['binary', 'oversized', 'malformed', 'rate']) {
    const tokens = { hostToken: token(), guestToken: token() }; const server = await startSignaling(tokens, 0);
    let ws: WebSocket | undefined;
    try {
      assert.ok(server.port > 0);
      ws = new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`, { headers: { Authorization: `Bearer ${tokens.guestToken}` } });
      ws.on('error', () => {}); await once(ws, 'open'); const closed = once(ws, 'close');
      if (kind === 'binary') ws.send(Buffer.from('binary'));
      if (kind === 'oversized') ws.send('x'.repeat(65_537));
      if (kind === 'malformed') ws.send('{broken');
      if (kind === 'rate') for (let i = 0; i < 101; i++) ws.send(JSON.stringify({ v: 1, type: 'sync' }));
      const [code] = await closed; assert.equal(code, kind === 'oversized' ? 1009 : kind === 'binary' ? 1003 : 1008);
    } finally { ws?.terminate(); await server.close(); }
  }
});
test('the per-role traffic limit survives authenticated reconnection', async () => {
  const tokens = { hostToken: token(), guestToken: token() }; const server = await startSignaling(tokens, 0);
  const owned: WebSocket[] = [];
  try {
    const open = () => { const ws = new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`, { headers: { Authorization: `Bearer ${tokens.guestToken}` } }); ws.on('error',()=>{}); owned.push(ws); return ws; };
    const first = open(); let replies = 0; first.on('message',()=>{replies++;}); await once(first,'open');
    for(let i=0;i<100;i++)first.send(JSON.stringify({v:1,type:'sync'})); await wait(()=>replies>=101);
    const closed = once(first,'close'); first.close(); await closed; await wait(()=>!server.coordinator.isOnline('guest'));
    const next = open(); await once(next,'open'); const limited = once(next,'close',{signal:AbortSignal.timeout(1500)});
    next.send(JSON.stringify({v:1,type:'sync'})); assert.equal((await limited)[0],1008);
  } finally { for(const ws of owned)ws.terminate(); await server.close(); }
});
