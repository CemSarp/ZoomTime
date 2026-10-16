import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSettings, writeSettings } from '../src/settings.ts';

test('first-run missing preferences use defaults without an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-settings-'));
  assert.deepEqual(readSettings(join(dir, 'missing.json')),
    { bounds: { version: 1, normal: null, mini: null }, preferences: { mirror: true, miniSelf: false, quality: '720p', previewSize: 24, normalAlwaysOnTop: false, miniAlwaysOnTop: true, speakerEchoReduction: false }, error: false });
});
test('saved bounds round-trip through a private atomic settings file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-settings-'));
  const file = join(dir, 'nested', 'bounds.json');
  const bounds = { version: 1 as const, normal: { x: 20, y: 40, width: 900, height: 600 }, mini: null };
  assert.equal(writeSettings(file, bounds), true);
  assert.deepEqual(readSettings(file), { bounds, preferences: { mirror: true, miniSelf: false, quality: '720p', previewSize: 24, normalAlwaysOnTop: false, miniAlwaysOnTop: true, speakerEchoReduction: false }, error: false });
  assert.equal(statSync(file).mode & 0o777, 0o600);
});
test('corrupt settings produce a recoverable error without changing their source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-settings-'));
  const file = join(dir, 'bounds.json');
  writeFileSync(file, '{broken');
  assert.deepEqual(readSettings(file), { bounds: { version: 1, normal: null, mini: null }, preferences: { mirror: true, miniSelf: false, quality: '720p', previewSize: 24, normalAlwaysOnTop: false, miniAlwaysOnTop: true, speakerEchoReduction: false }, error: true });
  assert.equal(readFileSync(file, 'utf8'), '{broken');
});
test('an unwritable preferences target is reported rather than thrown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-settings-'));
  const parentFile = join(dir, 'not-a-directory');
  writeFileSync(parentFile, 'keep');
  assert.equal(writeSettings(join(parentFile, 'bounds.json'), { version: 1, normal: null, mini: null }), false);
  assert.equal(readFileSync(parentFile, 'utf8'), 'keep');
});

test('camera preferences persist with bounds and old geometry-only settings migrate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-settings-'));
  const file = join(dir, 'settings.json');
  writeFileSync(file, JSON.stringify({ version: 1, normal: null, mini: null }));
  assert.equal(readSettings(file).preferences.quality, '720p');
  const preferences = { mirror: false, miniSelf: true, quality: '1080p' as const, previewSize: 40, normalAlwaysOnTop: true, miniAlwaysOnTop: false, speakerEchoReduction: true };
  assert.equal(writeSettings(file, readSettings(file).bounds, preferences), true);
  assert.deepEqual(readSettings(file).preferences, preferences);
});
