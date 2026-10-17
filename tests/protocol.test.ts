import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvedEndpoint, parseClientMessage, parseInvitation, parseServerMessage } from '../src/protocol.ts';

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
test('only bounded v2 messages with exact identities cross the signaling boundary', () => {
  const callId = '01234567-0123-4123-8123-0123456789ab', pairId = '01234567-0123-4123-8123-0123456789ac';
  const base = { v: 2, callId, pairId, generation: 1 };
  for (const message of [{v:2,type:'request',operationId:pairId,targetIds:[callId]},{v:2,type:'sync'},
    {...base,type:'description',description:{type:'offer',sdp:'v=0\r\n'}},{...base,type:'ice',candidate:{candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0}},
    {...base,type:'ice',candidate:null},{v:2,type:'media',callId,audio:true,video:false},{v:2,type:'hangup',callId},
    {v:2,type:'accept',callId,invitationId:pairId,operationId:callId}]) assert.deepEqual(parseClientMessage(message),message);
  for(const message of [null,[],{v:1,type:'sync'},{v:2,type:'request',operationId:pairId,targetIds:[callId,callId]},
    {v:2,type:'sync',role:'host'},{...base,type:'description',generation:-1,description:{type:'offer',sdp:'v=0'}},
    {...base,type:'description',description:{type:'rollback',sdp:''}},{...base,type:'ice',candidate:{candidate:42}},
    {v:2,type:'media',callId,audio:'yes',video:false},{v:2,type:'accept',callId,invitationId:'stale',operationId:pairId},
    {...base,type:'description',fromId:callId,description:{type:'offer',sdp:'v=0'}},
    {...base,type:'description',description:{type:'offer',sdp:'x'.repeat(65_536)}}])assert.equal(parseClientMessage(message),null);
  const signal={...base,type:'ice',candidate:null,fromId:callId};assert.deepEqual(parseServerMessage(signal),signal);
  assert.equal(parseServerMessage({...signal,fromId:'host'}),null);
});
