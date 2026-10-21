import { test } from 'node:test';
import assert from 'node:assert/strict';
import { microphoneConstraints, requestMicrophone, speakerEchoStatus } from '../src/audio-processing.ts';
import { mediaEnvironment, FakeStream, FakeTrack, drain } from './media-fixtures.ts';

test('disabled speaker reduction retains remote-call echo cancellation and ordinary speech processing', () => {
  assert.deepEqual(microphoneConstraints(false), { echoCancellation: { ideal: 'remote-only' }, noiseSuppression: true, autoGainControl: true });
  assert.equal(speakerEchoStatus({ getSettings: () => ({ echoCancellation: 'remote-only' }) }, false), 'standard');
});
test('speaker reduction prefers all without requiring unsupported devices to fail', () => {
  assert.deepEqual(microphoneConstraints(true), { echoCancellation: { ideal: 'all' }, noiseSuppression: true, autoGainControl: true });
});
test('only the actual applied setting confirms system-audio cancellation', () => {
  assert.equal(speakerEchoStatus({ getSettings: () => ({ echoCancellation: 'all' }) }, true), 'all');
  for (const echoCancellation of [true, false, 'remote-only', undefined]) {
    assert.equal(speakerEchoStatus({ getSettings: () => ({ echoCancellation }) }, true), 'unavailable');
  }
});
test('live microphone requests require advertised modes and retain optional fallback for other sources', async context => {
  const env = mediaEnvironment(context), requested: MediaStreamConstraints[] = [];
  env.devices.getUserMedia = async constraints => { requested.push(constraints); return new FakeStream([new FakeTrack('audio')]); };
  const supported = { getCapabilities: () => ({ echoCancellation: [true, false, 'all', 'remote-only'] }) };
  await requestMicrophone(true, supported); await requestMicrophone(false, supported); await requestMicrophone(true, new FakeTrack('audio'));
  assert.deepEqual(requested.map(r => (r.audio as MediaTrackConstraints).echoCancellation), [{ exact: 'all' }, { exact: 'remote-only' }, { ideal: 'all' }]);
  assert.ok(requested.every(r => r.video === false));
});
test('a timed-out optional microphone change stops late audio tracks', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); const env = mediaEnvironment(context); let release!: (stream: FakeStream) => void;
  env.devices.getUserMedia = async () => new Promise<FakeStream>(resolve => { release = resolve; });
  const changing = requestMicrophone(true, new FakeTrack('audio')); const rejection = assert.rejects(changing, /timed out/); context.mock.timers.tick(60_000); await rejection;
  const late = new FakeTrack('audio'); release(new FakeStream([late])); await drain(); assert.equal(late.readyState, 'ended');
});
test('a microphone that ignores disabling broader cancellation is rejected and released', async context => {
  const env = mediaEnvironment(context), track = new FakeTrack('audio'); Object.defineProperty(track, 'getSettings', { value: () => ({ echoCancellation: 'all' }) });
  env.devices.getUserMedia = async () => new FakeStream([track]);
  await assert.rejects(() => requestMicrophone(false, track), /mode could not change/); assert.equal(track.readyState, 'ended');
});
