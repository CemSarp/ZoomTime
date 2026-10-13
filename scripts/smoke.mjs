import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const bundle = resolve(process.argv[2] ?? 'out/ZoomTime-darwin-arm64/ZoomTime.app');
const executable = join(bundle, 'Contents/MacOS/ZoomTime');
assert.equal(process.platform, 'darwin', 'Packaged UI checks require macOS');
assert.ok(existsSync(executable), 'Run npm run make:arm64 first, or pass an app bundle path');
async function smoke(minimum) {
  const userData = mkdtempSync(join(tmpdir(), 'zoomtime-smoke-'));
  if (minimum) writeFileSync(join(userData, 'window-bounds.json'), JSON.stringify({ version: 1,
    normal: null, mini: { x: 40, y: 40, width: 160, height: 90 } }));
  const server = createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  // Debugging is enabled only by this test launch, never by application code.
  const child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${userData}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
  let socket;
  try {
    let target;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, 'Test instance exited; close another running ZoomTime instance first');
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = targets.find(item => item.url === 'zoomtime://app/main_window/index.html');
        if (target) break;
      } catch { /* Wait for this test process to expose its local debugging endpoint. */ }
      await delay(100);
    }
    assert.ok(target, `No packaged renderer appeared. ${stderr}`);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    });
    const send = (method, params = {}, label = method) => new Promise((resolveReply, rejectReply) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); rejectReply(new Error(`${label} timed out`)); }, 5000);
      pending.set(requestId, { resolve: resolveReply, reject: rejectReply, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async expression => {
      const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: false }, expression.split('(')[0].slice(0, 60));
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
      return reply.result.value;
    };
    await send('Runtime.enable');
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await evaluate("document.body?.dataset.mode === 'normal' && document.querySelector('canvas')?.clientHeight > 0")) break;
      await delay(100);
    }
    const initial = await evaluate('window.zoomtime.getState()');
    assert.equal(initial.mode, 'normal');
    const rendererSession = await evaluate('document.body.dataset.rendererSession');
    assert.match(rendererSession ?? '', /^[0-9a-f-]{36}$/, 'Continuity evidence must identify the renderer itself');
    assert.equal(await evaluate('typeof require'), 'undefined');
    assert.equal(await evaluate('typeof process'), 'undefined');
    assert.equal(await evaluate('isSecureContext'), true);
    assert.deepEqual(await evaluate('Object.keys(window.zoomtime).sort()'), ['close', 'getState', 'onState', 'restore', 'setMode']);
    assert.equal(await evaluate("(() => {try {eval('1+1');return false;}catch(e){return e.name==='EvalError';}})()"), true, 'CSP must reject string evaluation');
    assert.equal(await evaluate("fetch('https://example.com').then(()=>false,()=>true)"), true, 'Renderer outbound requests must be blocked');
    assert.equal(await evaluate("window.open('https://example.com') === null"), true);
    assert.equal(await evaluate("window.zoomtime.setMode('unsupported').then(()=>false,()=>true)"), true);
    const permissions = await evaluate("Promise.all(['camera','microphone'].map(name=>navigator.permissions.query({name}).then(p=>({name,state:p.state}))))");
    console.log('Browser permission states:', JSON.stringify(permissions));
    assert.deepEqual(permissions, [{ name: 'camera', state: 'denied' }, { name: 'microphone', state: 'denied' }], 'Probe must deny media permission');
    await delay(1000);
    const counter = () => evaluate("Number(document.getElementById('frames').textContent.replaceAll(',', ''))");
    const firstFrame = await counter();
    assert.ok(firstFrame > 0, 'Synthetic motion must render');
    const output = resolve('out/verification');
    mkdirSync(output, { recursive: true });
    const screenshot = async name => {
      const result = await send('Page.captureScreenshot');
      writeFileSync(join(output, name), Buffer.from(result.data, 'base64'));
    };
    if (!minimum) await screenshot('normal.png');
    const mini = await evaluate("window.zoomtime.setMode('mini')");
    assert.deepEqual({ width: mini.bounds.width, height: mini.bounds.height },
      minimum ? { width: 160, height: 90 } : { width: 320, height: 180 });
    assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
    await delay(1100);
    assert.equal(await evaluate('document.body.dataset.mode'), 'mini');
    assert.ok(await counter() > firstFrame, 'Mini mode must retain the live renderer');
    assert.equal(await evaluate("['restore','close'].every(id=>{const b=document.getElementById(id).getBoundingClientRect();return b.width>=32&&b.height>=32&&b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;})"), true, 'Mini controls must fit inside the real native window');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 });
    await delay(200);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mini-controls')).opacity"), '1', 'Hover must expose mini controls');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -10, y: -10 });
    await evaluate('document.activeElement.blur()');
    await delay(200);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mini-controls')).opacity"), '0');
    const key = async (name, code, modifiers = 0) => {
      const params = { key: name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
      if (name === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...params });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    };
    await key('Tab', 9);
    assert.equal(await evaluate('document.activeElement.id'), 'restore', 'Tab must reach restore');
    await delay(200);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mini-controls')).opacity"), '1', 'Keyboard focus must expose mini controls');
    await key('Tab', 9);
    assert.equal(await evaluate('document.activeElement.id'), 'close', 'Tab must reach close');
    await key('Tab', 9, 8);
    assert.equal(await evaluate('document.activeElement.id'), 'restore');
    await screenshot(minimum ? 'mini-minimum.png' : 'mini.png');
    await key('Enter', 13);
    await delay(200);
    const restored = await evaluate('window.zoomtime.getState()');
    assert.equal(restored.mode, 'normal', 'Enter must activate restore');
    assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
    assert.deepEqual(restored.bounds, initial.bounds, 'Normal geometry must survive mini mode');
    assert.equal(restored.preferencesError, false);
    await evaluate("window.zoomtime.setMode('mini')");
    await key('Escape', 27);
    await delay(200);
    assert.equal((await evaluate('window.zoomtime.getState()')).mode, 'normal', 'Escape must restore mini mode');
    for (let i = 0; i < 5; i++) {
      await evaluate("window.zoomtime.setMode('mini')");
      assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
      await evaluate('window.zoomtime.restore()');
      assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
    }
    const result = { timestamp: new Date().toISOString(), architecture: process.arch,
      packagedBundle: bundle, checks: ['bundled secure origin', 'no renderer Node', 'narrow bridge', 'production CSP',
        'blocked network/new window', 'invalid IPC rejected', 'camera/microphone permission queries denied', 'renderer identity and animated continuity',
        minimum ? '160x90 mini' : '320x180 mini', 'controls fit native window', 'hover exposes controls', 'Tab reaches restore and close',
        'Enter and Escape restore', 'normal bounds restored', 'five repeated transitions'],
      directCaptureDenial: 'untested; acquisition test remained pending and was terminated',
      physicalFullScreenGate: 'pending on both actual Macs', rendererSession };
    writeFileSync(join(output, minimum ? 'packaged-smoke-minimum.json' : 'packaged-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Packaged smoke passed: ${result.checks.length} checks. Both-Mac full-screen gate remains pending.`);
  } finally {
    socket?.close();
    child.kill('SIGTERM');
  }
}
await smoke(false);
await smoke(true);
