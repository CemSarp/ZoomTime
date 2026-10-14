import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Coordinator } from '../src/coordinator.ts';
import type { ClientMessage, ServerMessage } from '../src/protocol.ts';
function setup() {
  const coordinator = new Coordinator();
  const host: ServerMessage[] = [], guest: ServerMessage[] = [];
  assert.equal(coordinator.attach('host', message => host.push(message), 0), true);
  assert.equal(coordinator.attach('guest', message => guest.push(message), 0), true);
  const send = (role: 'host' | 'guest', type: string, extra = {}, now = 0) => coordinator.receive(role, { v: 1, type, ...extra } as ClientMessage, now);
  const call = () => { const call = coordinator.snapshot; assert.ok(call); return call; };
  const negotiate = () => {
    const base = { callId: call().id, generation: call().generation };
    send('host', 'description', { ...base, description: { type: 'offer', sdp: 'v=0' } });
    send('guest', 'description', { ...base, description: { type: 'answer', sdp: 'v=0' } });
    send('host', 'connected', base); send('guest', 'connected', base);
  };
  return { coordinator, host, guest, send, call, negotiate };
}
test('concurrent requests combine into one call with the host as the only offerer', () => {
  const s = setup(); s.send('guest', 'request'); const id = s.call().id;
  s.send('host', 'request'); assert.equal(s.call().id, id); assert.equal(s.call().phase, 'connecting');
  s.send('guest', 'description', { callId: id, generation: 1, description: { type: 'offer', sdp: 'v=0' } });
  assert.equal(s.guest.at(-1)?.type, 'error');
  s.negotiate(); assert.equal(s.call().phase, 'connected');
  s.coordinator.tick(12 * 60 * 60 * 1000); assert.equal(s.call().phase, 'connected', 'Healthy calls have no application time limit');
});
test('stale call IDs and negotiation generations cannot reach the other peer', () => {
  const s = setup(); s.send('host', 'request'); s.send('guest', 'accept', { callId: s.call().id });
  const count = s.guest.length;
  s.send('host', 'ice', { callId: '11111111-1111-4111-8111-111111111111', generation: 1, candidate: null });
  s.send('host', 'ice', { callId: s.call().id, generation: 99, candidate: null });
  assert.equal(s.guest.length, count); assert.equal(s.host.at(-1)?.type, 'error');
});
test('duplicate roles cannot evict the existing participant', () => {
  const s = setup(); assert.equal(s.coordinator.attach('guest', () => assert.fail('competitor received data'), 0), false);
  assert.equal(s.coordinator.isOnline('guest'), true);
});
test('duplicate connected acknowledgements do not cause a signaling feedback loop', () => {
  const s = setup(); s.send('host', 'request'); s.send('guest', 'accept', { callId: s.call().id }); s.negotiate();
  s.coordinator.detach('guest', 1000); const count = s.host.length;
  s.send('host', 'connected', { callId: s.call().id, generation: 1 }, 1001);
  assert.equal(s.host.length, count, 'An already connected role must not rebroadcast the same recovery state');
});
test('ring and initial connection timeouts end calls exactly once', () => {
  const s = setup(); s.send('host', 'request'); s.coordinator.tick(59_999); assert.equal(s.call().phase, 'ringing');
  s.coordinator.tick(60_000); assert.equal(s.coordinator.snapshot, null); assert.equal(s.host.at(-2)?.type, 'ended');
  const ended = s.host.filter(m => m.type === 'ended').length; s.coordinator.tick(90_000); assert.equal(s.host.filter(m => m.type === 'ended').length, ended);
  s.send('host', 'request', {}, 100_000); s.send('guest', 'accept', { callId: s.call().id }, 100_000);
  s.coordinator.tick(130_000); assert.equal(s.coordinator.snapshot, null);
});
test('signaling resumes the same call and allows one ICE restart per outage', () => {
  const s = setup(); s.send('host', 'request'); s.send('guest', 'accept', { callId: s.call().id }); s.negotiate();
  const id = s.call().id; s.coordinator.detach('guest', 1000); assert.equal(s.call().phase, 'reconnecting');
  s.coordinator.attach('guest', m => s.guest.push(m), 2000); assert.equal(s.call().id, id);
  s.send('guest', 'recover', { callId: id }, 6000); const gen = s.call().generation;
  assert.equal(gen, 2); s.send('host', 'recover', { callId: id }, 6001); assert.equal(s.call().generation, gen);
  s.negotiate(); assert.equal(s.call().phase, 'connected');
  s.coordinator.detach('guest', 10_000); s.coordinator.tick(40_000); assert.equal(s.coordinator.snapshot, null);
});
test('cancel, reject and reset release the active session and cannot resurrect it', () => {
  for (const reason of ['cancel', 'reject', 'reset']) {
    const s = setup(); s.send('host', 'request'); const id = s.call().id;
    if (reason === 'reset') s.coordinator.end('pairing-reset'); else s.send(reason === 'cancel' ? 'host' : 'guest', reason, { callId: id });
    assert.equal(s.coordinator.snapshot, null); s.send('guest', 'accept', { callId: id }); assert.equal(s.coordinator.snapshot, null);
  }
});
