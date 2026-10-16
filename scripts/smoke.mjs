import assert from 'node:assert/strict';
import { compareVersions } from '../src/updates.ts';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
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
    normal: { x: 40, y: 40, width: 640, height: 420 }, mini: { x: 40, y: 40, width: 160, height: 90 } }));
  const server = createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  // Debugging is enabled only by this test launch, never by application code.
  const child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${userData}`, '--use-fake-device-for-media-stream', '--mute-audio'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
      const timeout = /^window.zoomtime\.(createHost|retryConnection|resetPairing|setFullScreen|setMode|minimize|restore)/.test(label) ? 30000 : 5000;
      const timer = setTimeout(() => { pending.delete(requestId); rejectReply(new Error(`${label} timed out`)); }, timeout);
      pending.set(requestId, { resolve: resolveReply, reject: rejectReply, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async expression => {
      const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true, allowUnsafeEvalBlockedByCSP: false }, expression.split('(')[0].slice(0, 60));
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
      return reply.result.value;
    };
    await send('Runtime.enable');
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await evaluate("document.body?.dataset.mode === 'normal' && !!document.body.dataset.rendererSession")) break;
      await delay(100);
    }
    const initial = await evaluate('window.zoomtime.getState()');
    assert.equal(initial.mode, 'normal');
    const rendererSession = await evaluate('document.body.dataset.rendererSession');
    assert.match(rendererSession ?? '', /^[0-9a-f-]{36}$/, 'Continuity evidence must identify the renderer itself');
    const duplicate = spawn(executable, [`--user-data-dir=${userData}`], { stdio: 'ignore' });
    try {
      const exit = await new Promise((done, reject) => { const timer = setTimeout(() => reject(new Error('Duplicate instance did not exit')), 5000); duplicate.once('exit', code => { clearTimeout(timer); done(code); }); });
      assert.equal(exit, 0, 'Duplicate launch must hand off to the existing app');
      assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
    } finally { if (duplicate.exitCode === null) duplicate.kill('SIGTERM'); }
    assert.equal(await evaluate('typeof require'), 'undefined');
    assert.equal(await evaluate('typeof process'), 'undefined');
    assert.equal(await evaluate('isSecureContext'), true);
    assert.deepEqual(await evaluate('Object.keys(window.zoomtime).sort()'), ['authorizeCapture', 'close', 'copyInvitation', 'createHost', 'getCallingState', 'getState', 'importInvitation', 'onCallEvent', 'onState', 'onSettings', 'releaseCapture', 'resetPairing', 'restore', 'retryConnection', 'sendSignal', 'setMode', 'setPreferences', 'setupHost', 'setFullScreen', 'minimize', 'authorizeDeviceCheck', 'releaseDeviceCheck', 'getUpdateState', 'checkForUpdates', 'downloadUpdate', 'revealUpdate', 'onUpdateState'].sort());
    const updater = await evaluate('window.zoomtime.getUpdateState()');
    assert.equal(updater.status, 'idle', 'No network check runs at startup');
    assert.equal(updater.currentVersion, JSON.parse(readFileSync('package.json','utf8')).version);
    assert.deepEqual(Object.keys(updater).sort(), ['currentVersion','message','status']);
    assert.equal(await evaluate('window.zoomtime.revealUpdate().then(()=>false,()=>true)'),true,'Unverified files cannot be revealed');
    await evaluate('window.zoomtime.downloadUpdate()');
    assert.equal((await evaluate('window.zoomtime.getUpdateState()')).status,'idle','Downloading requires an available newer release');
    assert.equal(await evaluate("window.zoomtime.authorizeCapture('call').then(()=>false,()=>true)"), true, 'Unpaired apps cannot authorize capture');
    assert.equal(await evaluate("window.zoomtime.sendSignal({v:1,type:'request'}).then(()=>false,()=>true)"), true, 'Unpaired apps cannot signal a call');
    assert.deepEqual(await evaluate("window.zoomtime.getCallingState().then(s=>Object.keys(s).sort())"), ['call','endpoint','error','network','peerOnline','role']);
    assert.equal(await evaluate("getComputedStyle(document.getElementById('remote')).objectFit"),'contain');
    await evaluate('window.__remoteForTest=document.getElementById("remote")');
    assert.equal(await evaluate("(() => {try {eval('1+1');return false;}catch(e){return e.name==='EvalError';}})()"), true, 'CSP must reject string evaluation');
    assert.equal(await evaluate("fetch('https://example.com').then(()=>false,()=>true)"), true, 'Renderer outbound requests must be blocked');
    assert.equal(await evaluate("window.open('https://example.com') === null"), true);
    await evaluate("location.assign('https://example.com')"); await delay(100);
    assert.equal(await evaluate('location.href'),'zoomtime://app/main_window/index.html','Arbitrary top-level navigation must be denied');
    assert.equal(await evaluate("window.zoomtime.setMode('unsupported').then(()=>false,()=>true)"), true);
    const permissions = await evaluate("Promise.all(['camera','microphone'].map(name=>navigator.permissions.query({name}).then(p=>({name,state:p.state}))))");
    console.log('Browser permission states:', JSON.stringify(permissions));
    assert.deepEqual(permissions, [{ name: 'camera', state: 'denied' }, { name: 'microphone', state: 'denied' }], 'Probe must deny media permission');
    const captureDenial = await evaluate("Promise.race([navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return 'unexpected-capture';},e=>e.name),new Promise(r=>setTimeout(()=>r('pending'),2000))])");
    assert.equal(captureDenial,'NotAllowedError','Capture must be rejected before explicit authorization');
    await evaluate('window.zoomtime.authorizeDeviceCheck()');
    assert.equal(await evaluate("window.zoomtime.authorizeCapture('call').then(()=>false,()=>true)"),true,'Device check must not authorize an unpaired call');
    await evaluate('window.zoomtime.releaseDeviceCheck()');
    assert.equal(await evaluate("navigator.permissions.query({name:'camera'}).then(p=>p.state)"),'denied','Stopping local check revokes media permission');
    await delay(1000);
    const counter = () => evaluate('performance.now()');
    const firstFrame = await counter();
    assert.ok(firstFrame > 0, 'Renderer must be running');
    const output = resolve('out/verification');
    mkdirSync(output, { recursive: true });
    const screenshot = async name => {
      const result = await send('Page.captureScreenshot');
      writeFileSync(join(output, name), Buffer.from(result.data, 'base64'));
    };
    if (!minimum) {
      const waitCheck = async (expression,label) => { for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}assert.fail(label); };
      const activeCheck = "document.getElementById('check-video').srcObject?.active && document.getElementById('check-level').value>0";
      const startCheck = async () => {
        await evaluate("document.getElementById('open-settings').click();document.getElementById('check-start').click()");
        await waitCheck(activeCheck,'Actual packaged UI must preview generated camera and meter input');
        await evaluate("window.__checkTracksForTest=document.getElementById('check-video').srcObject.getTracks()");
      };
      const stoppedCheck = "window.__checkTracksForTest.every(t=>t.readyState==='ended') && document.getElementById('check-video').srcObject===null";
      await startCheck();
      assert.equal(await evaluate("document.getElementById('check-listen').checked"),false,'Voice monitoring starts off');
      assert.equal(await evaluate("window.zoomtime.getCallingState().then(s=>s.call===null)"),true,'Local check never starts a call');
      await evaluate("document.getElementById('check-listen').click()");
      await waitCheck("document.getElementById('check-status').textContent.includes('listening through')",'Explicit voice monitoring starts');
      await evaluate("document.getElementById('check-listen').click()");
      await waitCheck("document.getElementById('check-status').textContent.includes('Listening is off')",'Voice monitoring stops');
      await evaluate("document.getElementById('check-title').scrollIntoView({block:'start'})"); await screenshot('device-check-active.png');
      await evaluate("document.getElementById('check-stop').click()"); await waitCheck(stoppedCheck,'Stop releases actual capture tracks');
      await startCheck(); await evaluate("document.getElementById('settings-close').click()"); await waitCheck(stoppedCheck,'Done releases camera and microphone');
      await startCheck(); await evaluate("window.zoomtime.setMode('mini')"); await waitCheck(stoppedCheck,'Mini mode releases device check');
      await evaluate('window.zoomtime.restore()');
      assert.equal(await evaluate("navigator.permissions.query({name:'microphone'}).then(s=>s.state)"),'denied','Check cleanup revokes permission');
    }
    if (!minimum) await screenshot('normal.png');
    assert.equal(await evaluate("window.zoomtime.setPreferences({mirror:'yes',miniSelf:true,quality:'1080p',previewSize:24}).then(()=>false,()=>true)"),true,'Invalid preferences must be rejected at IPC');
    await evaluate("window.zoomtime.setPreferences({mirror:true,miniSelf:true,quality:'1080p',previewSize:35})");
    await evaluate("window.__canvasForTest=document.createElement('canvas');window.__canvasForTest.width=320;window.__canvasForTest.height=180;let c=window.__canvasForTest.getContext('2d');c.fillStyle='#395986';c.fillRect(0,0,320,180);c.fillStyle='#fff';c.font='24px system-ui';c.fillText('Synthetic preview',20,90);window.__previewStream=window.__canvasForTest.captureStream(24);document.getElementById('local').srcObject=window.__previewStream;document.getElementById('self-preview').hidden=false;window.__previewForTest=document.getElementById('local');");
    assert.equal(await evaluate("getComputedStyle(document.getElementById('local')).transform"),'matrix(-1, 0, 0, 1, 0, 0)','Mirror only self-preview');
    assert.equal(await evaluate("getComputedStyle(document.getElementById('remote')).transform"),'none');
    const mini = await evaluate("window.zoomtime.setMode('mini')");
    assert.deepEqual({ width: mini.bounds.width, height: mini.bounds.height },
      minimum ? { width: 160, height: 90 } : { width: 320, height: 180 });
    assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
    await delay(1100);
    assert.equal(await evaluate('document.body.dataset.mode'), 'mini');
    await evaluate("document.getElementById('self-preview').hidden=false");
    assert.notEqual(await evaluate("getComputedStyle(document.getElementById('self-preview')).display"),'none','Optional mini preview is visible');
    assert.equal(await evaluate("document.getElementById('local')===window.__previewForTest"),true,'Same muted preview element survives');
    assert.equal(await evaluate("document.getElementById('local').muted"),true);
    const previewBounds = await evaluate("(() => {const r=document.getElementById('self-preview').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width};})()");
    const drag = minimum ? 10 : 25;
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:previewBounds.right-4,y:previewBounds.bottom-4});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:previewBounds.right-4,y:previewBounds.bottom-4});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:previewBounds.right-4+drag,y:previewBounds.bottom-4});
    await delay(100);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:previewBounds.right-4+drag,y:previewBounds.bottom-4});
    await delay(500);
    assert.ok((await evaluate('window.zoomtime.getState()')).preferences.previewSize>35,'Dragging preview corner changes and saves its relative size in mini mode');
    await screenshot(minimum ? 'mini-self-minimum.png' : 'mini-self.png');
    await evaluate("window.zoomtime.setPreferences({mirror:false,miniSelf:false,quality:'720p',previewSize:24})");
    assert.equal(await evaluate("getComputedStyle(document.getElementById('self-preview')).display"),'none','Mini preview can be hidden');
    assert.equal(await evaluate("getComputedStyle(document.getElementById('local')).transform"),'none','Mirroring can be disabled');

    assert.ok(await counter() > firstFrame, 'Mini mode must retain the live renderer clock');
    assert.equal(await evaluate("['mini-mute','mini-camera','mini-self','restore','close'].every(id=>{const b=document.getElementById(id).getBoundingClientRect();return b.width>=26&&b.height>=32&&b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;})"), true, 'Mini controls must fit inside the real native window');
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
    assert.equal(await evaluate('document.activeElement.id'), 'mini-self', 'Tab must reach preview toggle');
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
      assert.equal(await evaluate('document.getElementById("remote")===window.__remoteForTest'),true,'Mode changes must preserve the partner video element');
      await evaluate('window.zoomtime.restore()');
      assert.equal(await evaluate('document.body.dataset.rendererSession'), rendererSession);
    }
    await evaluate("window.__previewStream.getTracks().forEach(t=>t.stop());document.getElementById('local').srcObject=null;document.getElementById('self-preview').hidden=true");
    if (!minimum) {
      await evaluate('window.zoomtime.setFullScreen(true)');
      for(let i=0;i<100;i++){if((await evaluate('window.zoomtime.getState()')).fullScreen)break;await delay(100);}
      assert.equal((await evaluate('window.zoomtime.getState()')).fullScreen,true,'Enter actual native full screen');
      await delay(1000);
      const fromFull = await evaluate("window.zoomtime.setMode('mini')");
      assert.equal(fromFull.fullScreen,false); assert.equal(fromFull.mode,'mini'); assert.equal(fromFull.bounds.width,320,'Full screen exits before shrinking');
      assert.deepEqual((await evaluate('window.zoomtime.restore()')).bounds,initial.bounds,'Normal bounds survive a real full-screen Space');
      await evaluate('window.zoomtime.setFullScreen(true)');
      for(let i=0;i<100;i++){if((await evaluate('window.zoomtime.getState()')).fullScreen)break;await delay(100);}
      await delay(1000); await evaluate('window.zoomtime.minimize()');
      assert.equal((await evaluate('window.zoomtime.getState()')).fullScreen,false,'Native full screen exits before Dock minimize');
      for(let i=0;i<40;i++){if((await evaluate('window.zoomtime.getState()')).minimized)break;await delay(50);}
      assert.equal((await evaluate('window.zoomtime.getState()')).minimized,true,'Actual native window is minimized to Dock');
      await evaluate('window.zoomtime.restore()');
      assert.equal(await evaluate('document.body.dataset.rendererSession'),rendererSession);
      await evaluate("document.getElementById('open-settings').click()");
      assert.equal(await evaluate("document.getElementById('settings').open"),true);
      await evaluate("document.getElementById('mirror').click()");
      for(let i=0;i<40;i++){if((await evaluate('window.zoomtime.getState()')).preferences.mirror)break;await delay(50);}
      assert.equal((await evaluate('window.zoomtime.getState()')).preferences.mirror,true,'Settings checkbox updates persistent preference');
      await evaluate("document.getElementById('preview-size').value='38';document.getElementById('preview-size').dispatchEvent(new Event('change'))");
      for(let i=0;i<40;i++){if((await evaluate('window.zoomtime.getState()')).preferences.previewSize===38)break;await delay(50);}
      assert.equal((await evaluate('window.zoomtime.getState()')).preferences.previewSize,38,'Accessible slider resizes the self-preview');

      assert.equal(await evaluate("getComputedStyle(document.getElementById('open-settings')).backgroundColor==='rgba(0, 0, 0, 0)'"),false,'Settings has a visible button surface');
      assert.equal(await evaluate("document.getElementById('check-video').srcObject===null&&document.getElementById('check-listen').disabled"),true,'Opening settings never captures or enables voice monitoring');
      assert.equal(await evaluate("document.getElementById('update-download').hidden&&document.getElementById('update-reveal').hidden"),true,'No update is downloaded implicitly');
      await evaluate("document.getElementById('update-check').click()");
      for (let attempt=0;attempt<200;attempt++) {
        const update = await evaluate('window.zoomtime.getUpdateState()');
        if (update.status !== 'checking' && update.status !== 'idle') break;
        await delay(100);
      }
      const checkedUpdate = await evaluate('window.zoomtime.getUpdateState()');
      const rateLimited = checkedUpdate.status === 'error' && checkedUpdate.message === 'GitHub is limiting update requests. Try again later.';
      assert.ok(['current','available'].includes(checkedUpdate.status) || rateLimited,`Live GitHub check: ${checkedUpdate.message}`);
      if (rateLimited) console.log('Live GitHub update discovery is rate-limited; actionable error verified, newer-release discovery not verified in this run.');
      if (checkedUpdate.status === 'available') assert.equal(compareVersions(checkedUpdate.version,checkedUpdate.currentVersion),1,'Only a newer release can be offered');
      else if (!rateLimited) assert.match(checkedUpdate.message,/No newer published build/);
      assert.equal(await evaluate("document.getElementById('update-status').textContent"),checkedUpdate.message);
      await screenshot('settings.png');
      await evaluate("document.getElementById('check-title').scrollIntoView({block:'start'})"); await screenshot('device-check-panel.png');

      await evaluate("window.zoomtime.setMode('mini')"); assert.equal(await evaluate("document.getElementById('settings').open"),false,'Settings must not obscure a mini call');
      await evaluate('window.zoomtime.restore()');
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]}); await screenshot('normal-dark.png');
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]}); await screenshot('normal-light.png');
    }
    await evaluate("window.zoomtime.createHost('wss://local-test.tail.ts.net:8443/zoomtime')");
    for(let i=0;i<50;i++){if(await evaluate("window.zoomtime.getCallingState().then(s=>s.network.state==='online')"))break;await delay(50);}
    assert.equal(await evaluate("window.zoomtime.getCallingState().then(s=>s.role==='host'&&s.network.state==='online'&&!s.peerOnline)"),true,'Packaged host must start authenticated loopback signaling');
    assert.equal(await evaluate("(() => {const c=getComputedStyle(document.getElementById('reset')).backgroundColor.match(/\\d+/g).map(Number);return c[0]>170&&c[1]<100&&c[2]<120;})()"),true,'Reset pairing is clearly red');
    assert.equal(await evaluate("(() => {const a=document.getElementById('reset').getBoundingClientRect(),b=document.getElementById('retry').getBoundingClientRect();return a.left>=0&&a.right<=innerWidth&&(a.left>=b.right||a.top>=b.bottom);})()"),true,'Pairing actions fit without overlap');
    await screenshot(minimum ? 'paired-compact.png' : 'paired.png');
    const encrypted = readFileSync(join(userData,'pairing.bin'));
    assert.equal(encrypted.includes(Buffer.from('hostToken')),false);
    assert.throws(()=>JSON.parse(encrypted.toString('utf8')),'Pairing must not be plaintext JSON');
    await evaluate('window.zoomtime.retryConnection()');
    assert.equal(await evaluate("window.zoomtime.getCallingState().then(s=>s.role==='host')"),true,'Real safeStorage must decrypt saved pairing');
    await evaluate('window.zoomtime.resetPairing()');
    assert.equal(await evaluate("window.zoomtime.getCallingState().then(s=>s.role===null&&s.call===null)"),true,'Reset must return to unpaired and stop the host');
    const result = { timestamp: new Date().toISOString(), architecture: process.arch,
      packagedBundle: bundle, checks: ['bundled secure origin', 'no renderer Node', 'narrow bridge', 'production CSP',
        'blocked network/new window/navigation', 'invalid IPC rejected', 'unpaired capture and signaling denied', 'camera/microphone capture denied', 'renderer identity continuity', 'duplicate instance reuses renderer',
        minimum ? '160x90 mini' : '320x180 mini', 'controls fit native window', 'hover exposes controls', 'Tab reaches restore and close',
        'Enter and Escape restore', 'optional mini self-preview and mirror are local only', 'preferences validation', 'explicit local device check, meter, monitor and cleanup (normal-size run)', 'red Reset and bordered Settings', 'update IPC exposes no paths or arbitrary requests; no startup update/download', 'explicit Settings update result (normal-size run; see liveUpdateCheck for rate limits)', 'native full screen to mini and Dock minimize (normal-size run)', 'Settings dialog and system light/dark appearance', 'normal bounds restored', 'five repeated transitions', 'real packaged safeStorage and authenticated host', 'encrypted pairing survives retry', 'pairing reset'],
      directCaptureDenial: captureDenial === 'NotAllowedError' ? 'rejected with NotAllowedError before explicit call authorization' : `inconclusive: ${captureDenial}`,
      liveUpdateCheck: minimum ? 'tested in normal-size run' : await evaluate('window.zoomtime.getUpdateState()'),
      physicalFullScreenGate: 'user reports own Mac passing; partner Mac pending', rendererSession };
    writeFileSync(join(output, minimum ? 'packaged-smoke-minimum.json' : 'packaged-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Packaged smoke passed: ${result.checks.length} checks. Partner-Mac full-screen acceptance remains pending.`);
  } finally {
    socket?.close();
    child.kill('SIGTERM');
  }
}
await smoke(false);
await smoke(true);
