import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as preferences from '../src/preferences.ts';

test('untrusted preferences normalize and quality requests remain adaptable', () => {
  assert.deepEqual(preferences.decodePreferences({ mirror: false, miniSelf: true, quality: '1080p', previewSize: 35 }),
    { mirror: false, miniSelf: true, quality: '1080p', previewSize: 35, normalAlwaysOnTop: false, miniAlwaysOnTop: true, speakerEchoReduction: false, outputVolume: 100 });
  assert.deepEqual(preferences.decodePreferences({ mirror: 'yes', miniSelf: 1, quality: '4k', previewSize: Infinity }),
    { mirror: true, miniSelf: false, quality: '720p', previewSize: 24, normalAlwaysOnTop: false, miniAlwaysOnTop: true, speakerEchoReduction: false, outputVolume: 100 });
  assert.equal(preferences.decodePreferences({ previewSize: 100 }).previewSize, 45);
  assert.deepEqual(preferences.videoConstraints('1080p'), { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } });
  assert.deepEqual(preferences.videoConstraints('360p'), { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } });
});

test('normal and mini always-on-top choices migrate independently and reject non-booleans', () => {
  const old = preferences.decodePreferences({ mirror: false });
  assert.equal(old.normalAlwaysOnTop, false);
  assert.equal(old.miniAlwaysOnTop, true);
  for (const normalAlwaysOnTop of [false, true]) for (const miniAlwaysOnTop of [false, true]) {
    const value = preferences.decodePreferences({ normalAlwaysOnTop, miniAlwaysOnTop });
    assert.equal(value.normalAlwaysOnTop, normalAlwaysOnTop);
    assert.equal(value.miniAlwaysOnTop, miniAlwaysOnTop);
  }
  const invalid = preferences.decodePreferences({ normalAlwaysOnTop: 'true', miniAlwaysOnTop: 0 });
  assert.equal(invalid.normalAlwaysOnTop, false);
  assert.equal(invalid.miniAlwaysOnTop, true);
});

test('speaker echo reduction is explicitly opt-in and ignores invalid values', () => {
  assert.equal(preferences.decodePreferences(null).speakerEchoReduction, false);
  assert.equal(preferences.decodePreferences({ speakerEchoReduction: 'true' }).speakerEchoReduction, false);
  assert.equal(preferences.decodePreferences({ speakerEchoReduction: true }).speakerEchoReduction, true);
});

test('call output volume migrates at full level and validates bounded saved values',()=>{
  assert.equal(preferences.decodePreferences(null).outputVolume,100);
  for(const outputVolume of [0,25,100])assert.equal(preferences.decodePreferences({outputVolume}).outputVolume,outputVolume);
  assert.equal(preferences.decodePreferences({outputVolume:-1}).outputVolume,0);
  assert.equal(preferences.decodePreferences({outputVolume:200}).outputVolume,100);
  for(const outputVolume of [NaN,Infinity,'50',null])assert.equal(preferences.decodePreferences({outputVolume}).outputVolume,100);
});
