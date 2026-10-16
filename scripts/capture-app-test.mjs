import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const root = resolve('out/verification/capture-app'); mkdirSync(root, {recursive:true,mode:0o700});
const directory = mkdtempSync(join(root,'run-'));
const profile = join(directory,'profile'); mkdirSync(profile,{mode:0o700});
const executable = resolve(process.argv[2] ?? 'out/ZoomTime-darwin-arm64/ZoomTime.app/Contents/MacOS/ZoomTime');
const server = createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port = server.address().port;
await new Promise(r=>server.close(r));
const child = spawn(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','pipe']});
let stderr=''; child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8000)});
let socket;
try {
  let target;
  for(let n=0;n<100;n++){
    assert.equal(child.exitCode,null,stderr);
    try { target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.url==='zoomtime://app/main_window/index.html'); }catch{}
    if(target)break;await delay(100);
  }
  assert.ok(target,stderr);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result)}});
  const send=(method,params)=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value};
  for(let n=0;n<100;n++){if(await evaluate('typeof window.zoomtime?.getScreenCaptureState === "function"'))break;await delay(50)}
  const initial=await evaluate('window.zoomtime.getScreenCaptureState()'); assert.equal(initial.active,false);assert.equal(initial.busy,false);
  assert.equal(await evaluate('typeof require'), 'undefined');
  assert.equal(await evaluate("window.zoomtime.discoverScreenSources('yes').then(()=>false,()=>true)"),true);
  assert.equal(await evaluate("window.zoomtime.startScreenCapture({kind:'display',ids:[1],path:'/tmp/arbitrary'}).then(()=>false,()=>true)"),true);
  await evaluate("document.getElementById('open-settings').click();document.getElementById('screen-title').scrollIntoView({block:'start'})");
  assert.equal((await evaluate('window.zoomtime.getScreenCaptureState()')).active,false);
  const discovery=await evaluate('window.zoomtime.discoverScreenSources(false).then(s=>({ok:true,sources:s}),e=>({ok:false,message:e.message}))');
  let final;
  if(discovery.ok){
    assert.ok(discovery.sources.displays.length);
    await evaluate("document.getElementById('screen-refresh').click()");
    for(let n=0;n<100;n++){if(await evaluate("document.getElementById('screen-sources').options.length>0"))break;await delay(50)}
    assert.equal(await evaluate("document.getElementById('screen-start').disabled"),false);
    await evaluate("document.getElementById('screen-start').click()");
    await delay(3500);
    const active=await evaluate('window.zoomtime.getScreenCaptureState()'); assert.equal(active.active,true,active.message); assert.ok(active.statistics.encoder.encoded>0);
    await evaluate("document.getElementById('settings').close()");
    for(let n=0;n<100;n++){if(!(await evaluate('window.zoomtime.getScreenCaptureState()')).active)break;await delay(50)}
    final=await evaluate('window.zoomtime.getScreenCaptureState()');assert.equal(final.active,false);assert.equal(final.canReveal,true);
    assert.equal(readdirSync(join(profile,'captures')).length,1);
  } else { assert.match(discovery.message,/permission|Recording/i); final=await evaluate('window.zoomtime.getScreenCaptureState()');assert.equal(final.active,false); }
  await evaluate("document.getElementById('open-settings').click();document.getElementById('screen-title').scrollIntoView({block:'start'})");
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(directory,'app.png'),Buffer.from(shot.data,'base64'),{mode:0o600});
  writeFileSync(join(directory,'result.json'),JSON.stringify({initial,discovery:discovery.ok?'sources discovered':discovery,final,rendererSandbox:true,stderr},null,2),{mode:0o600});
  console.log(`Packaged app evidence: ${directory}; capture ${discovery.ok?'passed':'blocked by TCC'}`);
  await evaluate('window.zoomtime.close()');
}finally{socket?.close();child.kill('SIGTERM')}
