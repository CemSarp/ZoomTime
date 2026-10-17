import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startSignaling } from '../src/signaling.ts';
import { hostFixture, id, waitFor } from './group-fixtures.ts';
const wire = (message: object) => JSON.stringify({ v: 2, ...message });
test('five real loopback sockets authenticate identities; unauthorized, duplicate, legacy and browser clients fail', async () => {
  const host = hostFixture(), server = await startSignaling(host, 0), owned: WebSocket[] = [];
  const open = (token: string, version = '2', origin?: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`, { headers: { Authorization: `Bearer ${token}`, 'X-ZoomTime-Protocol': version }, origin });
    owned.push(ws); ws.on('error', () => {}); return ws;
  };
  try {
    assert.match(String((await once(open(randomBytes(32).toString('base64url')), 'error'))[0]), /401/);
    assert.match(String((await once(open(host.members[0].token, '1'), 'error'))[0]), /426/);
    assert.match(String((await once(open(host.members[0].token, '2', 'https://evil.test'), 'error'))[0]), /403/);
    for (const m of host.members) { const ws = open(m.token); await once(ws, 'open'); }
    await waitFor(() => host.members.every(m => server.coordinator.isOnline(m.id)));
    assert.match(String((await once(open(host.members[1].token), 'error'))[0]), /409/);
    assert.equal(owned[3].extensions, '');
    server.updatePairing({ ...host, members: host.members.filter(m => m.id !== id(5)) });
    await waitFor(() => !server.coordinator.isOnline(id(5)));
    assert.match(String((await once(open(host.members[4].token), 'error'))[0]), /401/);
  } finally { for (const ws of owned) ws.terminate(); await server.close(); }
});
test('binary, oversized, malformed and excessive control messages close only the offending member', async () => {
  for (const kind of ['binary', 'oversized', 'malformed', 'rate']) {
    const host = hostFixture(), server = await startSignaling(host, 0);
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`, { headers: { Authorization: `Bearer ${host.members[1].token}`, 'X-ZoomTime-Protocol': '2' } }); ws.on('error',()=>{});
    try {
      await once(ws,'open'); const closed = once(ws,'close');
      if (kind === 'binary') ws.send(Buffer.from('binary'));
      if (kind === 'oversized') ws.send('x'.repeat(65_537));
      if (kind === 'malformed') ws.send('{bad');
      if (kind === 'rate') for (let i=0;i<101;i++) ws.send(wire({type:'sync'}));
      assert.equal((await closed)[0], kind === 'oversized' ? 1009 : kind === 'binary' ? 1003 : 1008);
    } finally { ws.terminate(); await server.close(); }
  }
});
test('traffic control budget survives authenticated reconnection', async () => {
  const host=hostFixture(), server=await startSignaling(host,0), owned:WebSocket[]=[];
  const open=()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`,{headers:{Authorization:`Bearer ${host.members[1].token}`,'X-ZoomTime-Protocol':'2'}}); ws.on('error',()=>{});owned.push(ws);return ws;};
  try {
    const first=open();let replies=0;first.on('message',()=>replies++);await once(first,'open');
    for(let i=0;i<100;i++)first.send(wire({type:'sync'}));await waitFor(()=>replies>=101);
    const closed=once(first,'close');first.close();await closed;await waitFor(()=>!server.coordinator.isOnline(id(2)));
    const next=open();await once(next,'open');const limited=once(next,'close',{signal:AbortSignal.timeout(2000)});next.send(wire({type:'sync'}));assert.equal((await limited)[0],1008);
  } finally {for(const ws of owned)ws.terminate();await server.close();}
});
test('four authorized pair budgets allow mesh ICE bursts without lending one pair another pair budget', async () => {
  const host=hostFixture(),server=await startSignaling(host,0),owned:WebSocket[]=[];
  try {
    for(const m of host.members){const ws=new WebSocket(`ws://127.0.0.1:${server.port}/zoomtime`,{headers:{Authorization:`Bearer ${m.token}`,'X-ZoomTime-Protocol':'2'}});ws.on('error',()=>{});owned.push(ws);await once(ws,'open');}
    await waitFor(()=>host.members.every(m=>server.coordinator.isOnline(m.id)));
    server.coordinator.receive(id(1),{v:2,type:'request',operationId:id(101),targetIds:[2,3,4,5].map(id)},Date.now());
    for(const n of [2,3,4,5])server.coordinator.receive(id(n),{v:2,type:'accept',callId:server.coordinator.snapshot!.id,invitationId:server.coordinator.snapshot!.members.find(m=>m.id===id(n))!.invitationId!,operationId:id(100+n)},Date.now());
    const call=server.coordinator.snapshot!;
    let routed=0;for(const ws of owned.slice(1))ws.on('message',data=>{if(JSON.parse(data.toString()).type==='ice')routed++;});
    const pairs=call.pairs.filter(p=>p.a===id(1));
    for(const p of pairs)for(let i=0;i<100;i++)owned[0].send(wire({type:'ice',callId:call.id,pairId:p.id,generation:1,candidate:null}));
    await waitFor(()=>routed===400);assert.equal(owned[0].readyState,WebSocket.OPEN);
    const closed=once(owned[0],'close',{signal:AbortSignal.timeout(2000)});
    owned[0].send(wire({type:'ice',callId:call.id,pairId:pairs[0].id,generation:1,candidate:null}));assert.equal((await closed)[0],1008);
    assert.ok(owned.slice(1).every(ws=>ws.readyState===WebSocket.OPEN));
  } finally {for(const ws of owned)ws.terminate();await server.close();}
});
