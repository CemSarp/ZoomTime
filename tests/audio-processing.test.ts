import { test } from 'node:test';
import assert from 'node:assert/strict';
import { microphoneConstraints, speakerEchoStatus } from '../src/audio-processing.ts';

test('disabled experiment keeps ordinary speech processing', () => {
  assert.deepEqual(microphoneConstraints(false), { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  assert.equal(speakerEchoStatus({ getSettings: () => assert.fail() }, false), 'standard');
});
test('experimental request prefers all without requiring unsupported devices to fail', () => {
  assert.deepEqual(microphoneConstraints(true), { echoCancellation: { ideal: 'all' }, noiseSuppression: true, autoGainControl: true });
});
test('only the actual applied setting confirms system-audio cancellation', () => {
  assert.equal(speakerEchoStatus({ getSettings: () => ({ echoCancellation: 'all' }) }, true), 'all');
  for (const echoCancellation of [true, false, 'remote-only', undefined]) {
    assert.equal(speakerEchoStatus({ getSettings: () => ({ echoCancellation }) }, true), 'unavailable');
  }
});
