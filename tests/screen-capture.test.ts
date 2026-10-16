import test from 'node:test';
import assert from 'node:assert/strict';

test('capture selection validates ids, count and exclusive display/window modes', async () => {
  const module = await import('../src/screen-capture.ts').catch(() => null);
  assert.ok(module, 'screen capture boundary must exist');
  for (const value of [null, {}, { kind: 'display', ids: [] }, { kind: 'display', ids: [1, 2] },
    { kind: 'window', ids: [1, 1] }, { kind: 'window', ids: [1, 2, 3, 4, 5] },
    { kind: 'window', ids: [-1] }, { kind: 'window', ids: [1.5] },
    { kind: 'window', ids: [4294967296] }, { kind: 'window', ids: [1], path: '/tmp/leak' }]) {
    assert.throws(() => module.captureSelection(value));
  }
  assert.deepEqual(module.captureSelection({ kind: 'display', ids: [1] }), { kind: 'display', ids: [1] });
  assert.deepEqual(module.captureSelection({ kind: 'window', ids: [1, 2] }), { kind: 'window', ids: [1, 2] });
});

import { ScreenCapture } from '../src/screen-capture.ts';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
async function fixture() {
  await mkdir('out/verification/capture-unit', { recursive: true });
  const root = await mkdtemp(resolve('out/verification/capture-unit/run-'));
  const binary = join(root, 'helper.cjs');
  await writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const send = value => console.log(JSON.stringify(value));
const allowed = fs.existsSync(path.join(__dirname, 'allowed'));
if (process.argv[2] === 'permission') { send({granted:allowed}); }
else if (process.argv[2] === 'request') {
  fs.writeFileSync(path.join(__dirname,'request-pid'),String(process.pid));
  if(fs.existsSync(path.join(__dirname,'delay'))) setTimeout(()=>send({granted:allowed}),30000);
  else send({granted: allowed});
}
else if (process.argv[2] === 'discover') {
  if (fs.existsSync(path.join(__dirname,'native-denied'))) {
    send({type:'error',reason:'screen-permission',message:'internal diagnostic'});process.exit(1);
  }
  if (!allowed) process.exit(1);
  send({displays: [{id:1,width:1280,height:720}],windows: []});
} else {
  fs.writeFileSync(process.argv[4], 'fixture only', {flag:'wx'});
  send({type:'selected'});
  if (JSON.parse(process.argv[3]).ids[0]===88) send({type:'error',message:'Output write failed'});
  require('node:readline').createInterface({input:process.stdin}).on('line', line => {
    if (line==='stop') { send({type:'stopped',encoder:{encoded:JSON.parse(process.argv[3]).ids[0]===77?0:1}}); process.exit(0); }
    const selection = JSON.parse(line);
    if (selection.ids[0]===99) send({type:'selection-error',message:'Window no longer available'});
    else send({type:'selected'});
  });
}
`, { mode: 0o700 });
  return { root, binary };
}
async function until(predicate: () => boolean) {
  for (let index = 0; index < 100; index++) { if (predicate()) return; await delay(20); }
  assert.fail('Helper state deadline');
}

test('permission refusal, explicit recovery and discovery never start a stream', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  assert.equal(service.inUse, false);
  await assert.rejects(service.discover(true), /not authorized for this copy/);
  assert.equal(service.inUse, false); assert.equal(service.state.active, false);
  await writeFile(join(root, 'allowed'), '');
  assert.equal((await service.discover(false)).displays[0].id, 1);
  assert.equal(service.inUse, false); assert.equal(service.state.busy, false);
  await assert.rejects(stat(join(root, 'captures')), { code: 'ENOENT' });
});

test('capture switches sources without replacing output, survives invalid ids, and drains on concurrent stop', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  await service.start({ kind: 'display', ids: [1] });
  await until(() => service.state.active);
  await service.start({ kind: 'window', ids: [99] });
  await until(() => !service.state.busy);
  assert.match(service.state.message, /no longer available/); assert.equal(service.state.active, true);
  await service.start({ kind: 'window', ids: [2, 3] });
  await until(() => !service.state.busy);
  await Promise.all([service.stop(), service.stop()]);
  assert.equal(service.inUse, false); assert.equal(service.state.active, false);
  assert.equal(service.state.canReveal, true);
  const path = service.outputPath(); assert.equal((await stat(path)).size, 12);
  await service.start({ kind: 'display', ids: [1] });
  await until(() => service.state.active); await service.stop();
  assert.notEqual(service.outputPath(), path);
});

test('immediate stop cancels late source startup and leaves no active helper', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  const start = service.start({ kind: 'display', ids: [1] });
  await service.stop(); await start;
  assert.equal(service.inUse, false); assert.equal(service.state.active, false);
});

test('Stop terminates a pending permission subprocess and never continues discovery', async () => {
  const { root, binary } = await fixture();
  await writeFile(join(root, 'delay'), '');
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  const discovery = service.discover(true).catch(error => error as Error);
  await until(() => existsSync(join(root, 'request-pid')));
  const pid = Number(readFileSync(join(root, 'request-pid'), 'utf8'));
  try {
    await service.stop(); await delay(50);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.match((await discovery as Error).message, /cancelled/);
    assert.equal(service.inUse, false);
  } finally { try { process.kill(pid, 'SIGTERM'); } catch {} await discovery; }
});

test('native output failure stops capture and never advertises successful output', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  await service.start({ kind: 'display', ids: [88] });
  await until(() => !service.inUse);
  assert.match(service.state.message, /Output write failed/);
  assert.equal(service.state.active, false); assert.equal(service.state.canReveal, false);
  assert.throws(() => service.outputPath());
});

test('stopping before any encoded frame does not advertise a ready file', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  await service.start({ kind: 'display', ids: [77] });
  await until(() => service.state.active); await service.stop();
  assert.equal(service.state.canReveal, false);
  assert.match(service.state.message, /no encoded frames/i);
});

test('native discovery denial retains permission recovery instead of a generic failure', async () => {
  const { root, binary } = await fixture();
  await writeFile(join(root, 'native-denied'), '');
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  await assert.rejects(service.discover(false), /this copy of ZoomTime/);
  assert.match(service.state.message, /restart|reopen/i);
  assert.doesNotMatch(service.state.message, /internal diagnostic/);
  assert.equal(service.state.active, false);
});

test('Allow reuses an existing grant without requesting Screen Recording again', async () => {
  const { root, binary } = await fixture();
  await writeFile(join(root, 'allowed'), '');
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  assert.equal((await service.discover(true)).displays.length, 1);
  assert.equal(existsSync(join(root, 'request-pid')), false);
});

test('a denied or stale grant directs recovery instead of repeatedly prompting in one session', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  await assert.rejects(service.discover(true), /this copy of ZoomTime/);
  const firstRequest = readFileSync(join(root, 'request-pid'), 'utf8');
  await assert.rejects(service.discover(true), /this copy of ZoomTime/);
  assert.equal(readFileSync(join(root, 'request-pid'), 'utf8'), firstRequest);
  await writeFile(join(root, 'allowed'), '');
  assert.equal((await service.discover(true)).displays.length, 1);
});

test('permission recovery opens settings only on explicit action and starts no capture', async () => {
  const { root, binary } = await fixture();
  const service = new ScreenCapture(binary, join(root, 'captures'), () => {});
  let opened = 0;
  assert.equal(opened, 0);
  await service.openPermissionSettings(async () => { opened += 1; });
  assert.equal(opened, 1); assert.equal(service.inUse, false); assert.equal(service.state.active, false);
  assert.match(service.state.message, /this copy of ZoomTime/);
  assert.match(service.state.message, /reopen/i);
  await assert.rejects(stat(join(root, 'captures')), { code: 'ENOENT' });
});
