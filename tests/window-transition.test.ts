import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { leaveFullScreen, changeFullScreen } from '../src/window-state.ts';

test('window transitions wait for native full-screen exit before resizing or minimizing', async () => {
  const window = Object.assign(new EventEmitter(), { isFullScreen: () => full, isSimpleFullScreen: () => false,
    setSimpleFullScreen: () => {}, setFullScreen: (enabled: boolean) => { assert.equal(enabled, false); requested = true; } });
  let full = true, requested = false, finished = false;
  const transition = leaveFullScreen(window).then(() => { finished = true; });
  await Promise.resolve(); assert.equal(requested, true); assert.equal(finished, false);
  full = false; window.emit('leave-full-screen'); await transition;
  assert.equal(finished, true); assert.equal(window.listenerCount('leave-full-screen'), 0);
});

test('entry completion is awaited, allowing an immediate queued exit', async () => {
  let full = false, entering = false;
  const window = Object.assign(new EventEmitter(), { isFullScreen: () => full, isSimpleFullScreen: () => false,
    setSimpleFullScreen: () => {}, setFullScreen: (enabled: boolean) => { entering = enabled; } });
  let finished = false;
  const transition = changeFullScreen(window, true).then(() => { finished = true; });
  await Promise.resolve(); assert.equal(entering, true); assert.equal(finished, false);
  full = true; window.emit('enter-full-screen'); await transition;
  assert.equal(finished, true); assert.equal(window.listenerCount('enter-full-screen'), 0);
});
