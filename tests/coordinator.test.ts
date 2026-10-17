import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Coordinator } from '../src/coordinator.ts';
import { parseServerMessage, type ClientMessage, type ServerMessage } from '../src/protocol.ts';
import { hostFixture, id } from './group-fixtures.ts';
function setup(count = 5) {
  const host = hostFixture(count), c = new Coordinator(host.groupId, host.hostId, host.members);
  const inbox = new Map<string, ServerMessage[]>();
  for (const m of host.members) { inbox.set(m.id, []); assert.ok(c.attach(m.id, message => inbox.get(m.id)!.push(message), 0)); }
  const send = (n: number, type: string, extra = {}, now = 0) => c.receive(id(n), { v: 2, type, ...extra } as ClientMessage, now);
  const call = () => { const snapshot = c.snapshot; assert.ok(snapshot); return snapshot; };
  const accept = (n: number, now = 0) => send(n, 'accept', { callId: call().id, invitationId: call().members.find(m => m.id === id(n))!.invitationId, operationId: id(100 + n) }, now);
  const request = (n: number, targets: number[], now = 0) => send(n, 'request', { operationId: id(100 + n), targetIds: targets.map(id) }, now);
  const negotiate = (pairId: string, now = 0) => {
    const p = call().pairs.find(p => p.id === pairId)!;
    const base = { callId: call().id, pairId, generation: p.generation };
    c.receive(p.a, { v: 2, type: 'description', ...base, description: { type: 'offer', sdp: 'v=0' } }, now);
    c.receive(p.b, { v: 2, type: 'description', ...base, description: { type: 'answer', sdp: 'v=0' } }, now);
    c.receive(p.a, { v: 2, type: 'connected', ...base }, now); c.receive(p.b, { v: 2, type: 'connected', ...base }, now);
  };
  return { c, inbox, send, call, accept, request, negotiate, host };
}
test('guest initiation grows from two to five with ten independent pairs and no restart of healthy pairs', () => {
  const s = setup(); s.request(2, [3]); s.accept(3);
  assert.equal(s.call().pairs.length, 1); const original = s.call().pairs[0]; s.negotiate(original.id);
  s.send(3, 'invite', { callId: s.call().id, targetIds: [id(1), id(4), id(5)] });
  for (const n of [1, 4, 5]) s.accept(n);
  assert.equal(s.call().pairs.length, 10); assert.deepEqual(s.call().pairs.find(p => p.id === original.id), { ...original, phase: 'connected' });
  for (const p of s.call().pairs) s.negotiate(p.id);
  assert.ok(s.call().pairs.every(p => p.phase === 'connected' && p.offererId === p.a && p.a < p.b));
  s.c.tick(12 * 60 * 60 * 1000); assert.ok(s.c.snapshot, 'No healthy-call duration limit');
});
test('host or initiator leaving media preserves remaining guest calls and only removes affected pairs', () => {
  const s = setup(); s.request(1, [2, 3, 4]); for (const n of [2, 3, 4]) s.accept(n);
  const healthy = s.call().pairs.find(p => p.a === id(2) && p.b === id(3))!;
  s.negotiate(healthy.id); s.send(1, 'hangup', { callId: s.call().id });
  assert.equal(s.call().pairs.length, 3); assert.equal(s.c.isOnline(id(1)), true);
  assert.equal(s.call().pairs.find(p => p.id === healthy.id)?.phase, 'connected');
  s.send(4, 'hangup', { callId: s.call().id }); assert.equal(s.call().pairs.length, 1);
  s.send(2, 'hangup', { callId: s.call().id }); assert.equal(s.c.snapshot, null);
});
test('matching simultaneous participant sets converge and unrelated requests are busy', () => {
  const s = setup(); s.request(2, [3]); const callId = s.call().id;
  s.request(3, [2]); assert.equal(s.call().id, callId); assert.equal(s.call().pairs.length, 1);
  s.request(4, [5]); assert.equal(s.inbox.get(id(4))!.at(-1)?.type, 'error');
  assert.equal(s.call().members.length, 2);
});
test('offline, self, duplicate and unknown targets cannot create or expand a call', () => {
  const s = setup(); s.c.detach(id(5), 0);
  for (const targets of [[1], [2, 2], [6], [5]]) { s.request(1, targets); assert.equal(s.c.snapshot, null); }
  s.request(1, [2]); s.accept(2); s.send(1, 'invite', { callId: s.call().id, targetIds: [id(3), id(5)] });
  assert.equal(s.call().members.length, 2);
});
test('decline, expiry and stale invitations affect only their recipients; rejoin needs a fresh invitation', () => {
  const s = setup(); s.request(1, [2, 3]); const stale = s.call().members.find(m => m.id === id(3))!.invitationId;
  s.accept(2); s.negotiate(s.call().pairs[0].id); s.send(3, 'reject', { callId: s.call().id, invitationId: stale });
  assert.equal(s.call().members.find(m => m.id === id(3))?.status, 'declined');
  s.send(1, 'invite', { callId: s.call().id, targetIds: [id(3)] }, 100);
  s.send(3, 'accept', { callId: s.call().id, invitationId: stale, operationId: id(103) });
  assert.equal(s.call().pairs.length, 1); s.c.tick(60_100);
  assert.equal(s.call().members.find(m => m.id === id(3))?.status, 'expired');
  s.send(1, 'invite', { callId: s.call().id, targetIds: [id(3)] }, 60_101); s.accept(3, 60_102);
  assert.equal(s.call().pairs.length, 3);
});
test('only authenticated endpoints route current negotiation, and offerer is deterministic for guest pairs', () => {
  const s = setup(); s.request(2, [3]); s.accept(3); const p = s.call().pairs[0], base = { callId: s.call().id, pairId: p.id, generation: 1 };
  const count = s.inbox.get(id(3))!.length;
  s.send(4, 'ice', { ...base, candidate: null }); s.send(2, 'ice', { ...base, generation: 99, candidate: null });
  s.send(3, 'description', { ...base, description: { type: 'offer', sdp: 'v=0' } });
  assert.equal(s.inbox.get(id(3))!.length, count + 1, 'Only the wrong-offerer error reaches that guest');
  s.send(2, 'ice', { ...base, candidate: null }); const routed = s.inbox.get(id(3))!.at(-1);
  assert.ok(routed?.type === 'ice'); assert.equal(routed.fromId, id(2));
});
test('pair recovery restarts once, remains isolated and duplicate acknowledgements do not loop', () => {
  const s = setup(); s.request(1, [2, 3]); s.accept(2); s.accept(3); for (const p of s.call().pairs) s.negotiate(p.id);
  const p = s.call().pairs[0], other = s.call().pairs[2];
  const base = { callId: s.call().id, pairId: p.id, generation: 1 };
  s.send(1, 'recover', base, 100); s.send(2, 'recover', { ...base, generation: 2 }, 101);
  assert.equal(s.call().pairs[0].generation, 2); assert.deepEqual(s.call().pairs[2], other);
  s.negotiate(p.id, 102); const count = s.inbox.get(id(1))!.length;
  s.send(1, 'connected', { ...base, generation: 2 }, 103); assert.equal(s.inbox.get(id(1))!.length, count);
});
test('guest signaling expiry removes only that guest; host signaling expiry ends remaining media', () => {
  const s = setup(); s.request(2, [3, 4]); s.accept(3); s.accept(4); for (const p of s.call().pairs) s.negotiate(p.id);
  s.c.detach(id(4), 100); s.c.tick(30_100); assert.equal(s.call().pairs.length, 1);
  s.c.detach(id(1), 30_101); s.c.tick(60_101); assert.equal(s.c.snapshot, null);
});
test('ring and pair connect deadlines are bounded and terminal cleanup is idempotent', () => {
  const s = setup(); s.request(1, [2]); s.c.tick(59_999); assert.ok(s.c.snapshot); s.c.tick(60_000); assert.equal(s.c.snapshot, null);
  s.request(1, [2], 70_000); s.accept(2, 70_000); s.c.tick(100_000); assert.equal(s.c.snapshot, null);
  const ended = s.inbox.get(id(1))!.filter(m => m.type === 'ended').length; s.c.end('pairing-reset'); assert.equal(s.inbox.get(id(1))!.filter(m => m.type === 'ended').length, ended);
});
test('duplicate connections cannot evict a member and revoked members lose only their participation', () => {
  const s = setup(); assert.equal(s.c.attach(id(2), () => assert.fail(), 0), false);
  s.request(1, [2, 3]); s.accept(2); s.accept(3); s.c.updateMembers(s.host.members.filter(m => m.id !== id(3)), 1);
  assert.equal(s.call().pairs.length, 1); assert.equal(s.c.isOnline(id(3)), false);
});
test('reattachment at an expired deadline cannot revive an old membership', () => {
  const s=setup(2);s.request(1,[2]);s.accept(2);s.negotiate(s.call().pairs[0].id);
  s.c.detach(id(2),100);s.c.attach(id(2),m=>s.inbox.get(id(2))!.push(m),30_100);
  assert.equal(s.c.snapshot,null,'Attach must enforce elapsed recovery before deleting its deadline');
});
test('revoking the original guest inviter preserves parseable snapshots and healthy links', () => {
  const s=setup(5);s.request(2,[1,3,4,5]);for(const n of [1,3,4])s.accept(n);
  const retained=s.call().pairs.find(p=>p.a===id(3)&&p.b===id(4))!;s.negotiate(retained.id);
  s.c.updateMembers(s.host.members.filter(m=>m.id!==id(2)),1);
  for(const n of [1,3,4,5]){
    const message=s.inbox.get(id(n))!.at(-1)!;
    assert.equal(message.type,'state');assert.ok(parseServerMessage(message),`Member ${n} must not lose signaling after inviter revocation`);
  }
  assert.equal(s.call().pairs.find(p=>p.id===retained.id)?.phase,'connected');
  s.accept(5,2);assert.equal(s.call().pairs.length,6,'A still-current invitation remains usable after its inviter leaves');
});
