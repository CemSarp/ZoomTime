import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvedEndpoint, parseClientMessage, parseInvitation } from '../src/protocol.ts';

test('pairing accepts only a canonical private Tailscale WSS endpoint', () => {
  assert.equal(approvedEndpoint('wss://my-mac.example-tail.ts.net:8443/zoomtime'), 'wss://my-mac.example-tail.ts.net:8443/zoomtime');
  for (const endpoint of ['ws://my-mac.example-tail.ts.net:8443/zoomtime', 'wss://evil.test:8443/zoomtime',
    'wss://example.ts.net.evil.test:8443/zoomtime', 'wss://example.ts.net:8443/zoomtime?token=secret',
    'wss://user:secret@example.ts.net:8443/zoomtime', 'wss://example.ts.net/zoomtime',
    'wss://example.ts.net:8443/elsewhere', 'wss://example.ts.net:8443/zoomtime#x', null, {}]) {
    assert.equal(approvedEndpoint(endpoint), null);
  }
});
test('invitations validate version, role, endpoint and canonical 32-byte credential', () => {
  const invitation = { app: 'ZoomTime', v: 1, role: 'guest', endpoint: 'wss://mac.tail.ts.net:8443/zoomtime', token: 'a'.repeat(42) + 'A' };
  assert.deepEqual(parseInvitation(invitation), invitation);
  for (const change of [{ v: 2 }, { role: 'host' }, { token: 'short' }, { token: 'a'.repeat(43) },
    { endpoint: 'ws://127.0.0.1:47831/zoomtime' }, { extra: 'unexpected' }]) {
    assert.equal(parseInvitation({ ...invitation, ...change }), null);
  }
});
test('only bounded versioned messages with valid shapes cross the signaling boundary', () => {
  const base = { v: 1, callId: '01234567-0123-4123-8123-0123456789ab', generation: 1 };
  for (const message of [{ v: 1, type: 'request' }, { v: 1, type: 'sync' },
    { ...base, type: 'description', description: { type: 'offer', sdp: 'v=0\r\n' } },
    { ...base, type: 'ice', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } },
    { ...base, type: 'ice', candidate: null }, { v: 1, type: 'media', callId: base.callId, audio: true, video: false },
    { v: 1, type: 'hangup', callId: base.callId }]) {
    assert.deepEqual(parseClientMessage(message), message);
  }
  for (const message of [null, [], { v: 2, type: 'request' }, { v: 1, type: 'request', role: 'host' },
    { ...base, type: 'description', generation: -1, description: { type: 'offer', sdp: 'v=0' } },
    { ...base, type: 'description', description: { type: 'rollback', sdp: '' } },
    { ...base, type: 'ice', candidate: { candidate: 42 } },
    { v: 1, type: 'media', callId: base.callId, audio: 'yes', video: false },
    { v: 1, type: 'hangup', callId: 'old' }, { ...base, type: 'description', description: { type: 'offer', sdp: 'x'.repeat(65_536) } }]) {
    assert.equal(parseClientMessage(message), null);
  }
});
