import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampBounds, defaultBounds, decodeBounds } from '../src/window-state.ts';

const primary = { x: 0, y: 25, width: 1440, height: 875 };
test('off-screen saved mini bounds recover to the primary display', () => {
  assert.deepEqual(clampBounds({ x: 2500, y: 200, width: 320, height: 180 }, [primary], 'mini'),
    { x: 1120, y: 200, width: 320, height: 180 });
});
test('oversized normal window fits the available display', () => {
  assert.deepEqual(clampBounds({ x: -100, y: -100, width: 3000, height: 2000 }, [primary], 'normal'), primary);
});
test('mini minimum stays usable while normal mode restores its own minimum', () => {
  assert.deepEqual(clampBounds({ x: 20, y: 40, width: 10, height: 10 }, [primary], 'mini'),
    { x: 20, y: 40, width: 160, height: 90 });
  assert.deepEqual(clampBounds({ x: 20, y: 40, width: 160, height: 90 }, [primary], 'normal'),
    { x: 20, y: 40, width: 640, height: 420 });
});
test('a window on a left-hand monitor keeps negative coordinates', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(clampBounds({ x: -1500, y: 60, width: 900, height: 600 }, [primary, left], 'normal'),
    { x: -1500, y: 60, width: 900, height: 600 });
});
test('defaults center normal mode and place mini inside the current monitor', () => {
  assert.deepEqual(defaultBounds('normal', primary), { x: 270, y: 163, width: 900, height: 600 });
  assert.deepEqual(defaultBounds('mini', primary), { x: 1088, y: 688, width: 320, height: 180 });
});
test('saved normal and mini bounds stay independent', () => {
  assert.deepEqual(decodeBounds({ version: 1, normal: { x: 20, y: 30, width: 900, height: 600 },
    mini: { x: -400, y: 100, width: 200, height: 100 } }),
    { version: 1, normal: { x: 20, y: 30, width: 900, height: 600 },
      mini: { x: -400, y: 100, width: 200, height: 100 } });
});
test('malformed saved geometry and unsupported versions cannot become native bounds', () => {
  for (const value of [null, [], 'bad', { version: 2 }, { version: 1, normal: { x: Infinity, y: 0, width: 1, height: 1 } },
    { version: 1, mini: { x: 0, y: 0, width: -1, height: 100 } }]) {
    assert.deepEqual(decodeBounds(value), { version: 1, normal: null, mini: null });
  }
});
test('tiny work areas fit the window instead of leaving inaccessible controls offscreen', () => {
  assert.deepEqual(clampBounds({ x: 500, y: 300, width: 320, height: 180 },
    [{ x: 0, y: 0, width: 120, height: 80 }], 'mini'), { x: 0, y: 0, width: 120, height: 80 });
});
