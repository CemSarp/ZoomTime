import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as preferences from '../src/preferences.ts';

test('untrusted preferences normalize and quality requests remain adaptable', () => {
  assert.deepEqual(preferences.decodePreferences({ mirror: false, miniSelf: true, quality: '1080p', previewSize: 35 }),
    { mirror: false, miniSelf: true, quality: '1080p', previewSize: 35 });
  assert.deepEqual(preferences.decodePreferences({ mirror: 'yes', miniSelf: 1, quality: '4k', previewSize: Infinity }),
    { mirror: true, miniSelf: false, quality: '720p', previewSize: 24 });
  assert.equal(preferences.decodePreferences({ previewSize: 100 }).previewSize, 45);
  assert.deepEqual(preferences.videoConstraints('1080p'), { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } });
  assert.deepEqual(preferences.videoConstraints('360p'), { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } });
});
