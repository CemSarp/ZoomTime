const { app, BrowserWindow, ipcMain, protocol, session } = require('electron');
const { randomBytes } = require('node:crypto');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const root = process.cwd();
const startedAt=Date.now();
const windows = new Map(), clients = new Map(), reports = new Map(), ready = new Set(), timers = new Set();
const identityReports=new Map(),dropRequests=new Set(),pendingCaptures=new Set();let snapshot=new Map();
const authorized=new Set(),permissionResults=new Map(),qualityResults=new Map(),checkResults=new Map(),checkRaceResults=new Map(),echoResults=new Map();
const entry='zoomtime://app/main_window/index.html';
protocol.registerSchemesAsPrivileged([{scheme:'zoomtime',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let server;
const traffic = { host: { ice: 0, description: 0 }, guest: { ice: 0, description: 0 } };
const wait = async (predicate, label, timeout = 32000) => {
  const end = Date.now() + timeout;
  while (!predicate()) { assert.ok(Date.now() < end, label); await new Promise(r => setTimeout(r, 50)); }
};
app.whenReady().then(async () => {
  const { startSignaling } = await import(join(root, 'src/signaling.ts'));
  const { SignalingClient } = await import(join(root, 'src/signaling-client.ts'));
  const { allowCallMedia, CONTENT_SECURITY_POLICY, CALL_PERMISSIONS_POLICY } = await import(join(root,'src/security.ts'));
  const roleOf=event=>[...windows].find(([,w])=>w.webContents===event.sender&&event.senderFrame===w.webContents.mainFrame&&event.senderFrame.url===entry)?.[0];
  protocol.handle('zoomtime',request=>{
    const asset=request.url===entry?'index.html':request.url==='zoomtime://app/main_window/renderer.js'?'renderer.js':null;
    return asset?new Response(readFileSync(join(root,'out/media-tests',asset)),{headers:{'Content-Type':asset.endsWith('.html')?'text/html':'text/javascript','Content-Security-Policy':CONTENT_SECURITY_POLICY,'Permissions-Policy':CALL_PERMISSIONS_POLICY}}):new Response('',{status:404});
  });
  session.defaultSession.setPermissionCheckHandler((contents,permission,_origin,details)=>allowCallMedia(permission,details.requestingUrl??'',entry,details.isMainFrame,[...windows].some(([role,w])=>w.webContents===contents&&authorized.has(role)),details.mediaType?[details.mediaType]:[]));
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(allowCallMedia(permission,details.requestingUrl,entry,details.isMainFrame,[...windows].some(([role,w])=>w.webContents===contents&&authorized.has(role)),details.mediaTypes??[])));
  ipcMain.handle('harness:authorize',(event,action)=>{const role=roleOf(event),call=server.coordinator.snapshot;assert.ok(role);
    assert.ok((action==='check'&&!call)||(action==='call'&&!call&&server.coordinator.isOnline(role==='host'?'guest':'host'))||(action==='accept'&&call?.phase==='ringing'&&call.caller!==role)||(['camera','devices'].includes(action)&&call&&call.phase!=='ringing'));authorized.add(role);});
  ipcMain.handle('harness:release',event=>{const role=roleOf(event);assert.ok(role);authorized.delete(role);});
  const tokens = { hostToken: randomBytes(32).toString('base64url'), guestToken: randomBytes(32).toString('base64url') };
  server = await startSignaling(tokens, 0);
  ipcMain.handle('harness:send', (event, message) => { const role = [...windows].find(([,w]) => w.webContents === event.sender)?.[0]; assert.ok(role); if(message.type==='request'&&dropRequests.delete(role))return; if(message.type in traffic[role])traffic[role][message.type]++; assert.equal(clients.get(role).send(message), true); });
  ipcMain.on('harness:result', (event, result) => {
    const role = [...windows].find(([,w]) => w.webContents === event.sender)?.[0];
    if (result.type === 'echo-probe') echoResults.set(role,result);
    if (result.type === 'ready') ready.add(role); else { reports.set(role, result); if(result.type==='report')identityReports.set(role,result); if(result.type==='capture-pending')pendingCaptures.add(role); if(result.type==='permission-probe')permissionResults.set(role,result); if(result.type==='quality')qualityResults.set(role,result); if(result.type==='check')checkResults.set(role,result); if(result.type==='check-race')checkRaceResults.set(role,result); }
  });
  for (const role of ['host', 'guest']) {
    const window = new BrowserWindow({ width: 400, height: 300, show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', preload: join(root, 'tests/media-preload.cjs') } });
    windows.set(role, window); await window.loadURL(entry);
  }
  await wait(() => ready.size === 2, 'Both real browser contexts must initialize');
  const connect = role => {
    const client = new SignalingClient(`ws://127.0.0.1:${server.port}/zoomtime`, role === 'host' ? tokens.hostToken : tokens.guestToken,
      message => {
        if(message.type === 'description') { const timer = setTimeout(()=>{timers.delete(timer);windows.get(role).webContents.send('harness:event', message);},200); timers.add(timer); }
        else windows.get(role).webContents.send('harness:event', message);
      }, () => {});
    clients.set(role, client); client.start();
  };
  for (const role of ['host', 'guest']) connect(role);
  const action = (role, action) => windows.get(role).webContents.send('harness:event', { type: 'action', action });
  const report = async () => { identityReports.clear(); for (const role of ['host','guest']) action(role,'report'); await wait(()=>identityReports.size===2,'Collect peer identity reports'); snapshot=new Map(identityReports); };
  await wait(() => server.coordinator.isOnline('host') && server.coordinator.isOnline('guest'), 'Both roles authenticate');
  action('host','probe-permissions');await wait(()=>permissionResults.has('host'),'Real getUserMedia permission probe finishes');
  assert.deepEqual(permissionResults.get('host'),{type:'permission-probe',denied:true,kinds:['audio','video']});
  action('host','probe-echo'); await wait(()=>echoResults.has('host'),'Probe bundled Chromium system-audio cancellation with fake microphone');
  const echoProbe=echoResults.get('host');
  assert.ok(['all','unavailable'].includes(echoProbe.status));
  if(echoProbe.status==='all')assert.equal(echoProbe.setting,'all');
  console.log('GENERATED_MIC_ECHO_PROBE:',JSON.stringify(echoProbe));
  action('host','check-start-experimental'); await wait(()=>checkResults.get('host')?.state.active,'Experimental device check remains usable on unsupported generated tracks');
  assert.equal(checkResults.get('host').state.speakerEcho,'unavailable');
  action('host','check-stop'); await wait(()=>checkResults.get('host')?.liveTracks===0,'Experimental check releases all tracks');
  action('host','echo-on');
  action('host','check-start'); await wait(()=>checkResults.get('host')?.state.active&&checkResults.get('host')?.state.level>0,'Local check previews camera and measures generated microphone input');
  assert.equal(checkResults.get('host').state.listening,false); assert.equal(checkResults.get('host').monitorGain,0,'Microphone monitor must start at zero volume'); assert.equal(checkResults.get('host').liveTracks,2); assert.ok(checkResults.get('host').videoHeight>0);
  assert.equal(server.coordinator.snapshot,null,'A local check must never create a call');
  action('host','check-listen'); await wait(()=>checkResults.get('host')?.state.listening===true,'Explicit listening enables audio monitor');
  assert.ok(checkResults.get('host').monitorGain>0&&checkResults.get('host').monitorGain<=0.61);
  action('host','check-silence'); await wait(()=>checkResults.get('host')?.state.listening===false,'Listening can be disabled');
  assert.equal(checkResults.get('host').monitorGain,0,'Turning listening off must silence the audio graph');
  action('host','check-listen-race'); await wait(()=>checkRaceResults.has('host'),'Delayed monitoring enable finishes after a newer off action');
  assert.equal(checkRaceResults.get('host').state.listening,false,'A late enable must never undo a newer Off action');
  assert.equal(checkRaceResults.get('host').monitorGain,0);
  action('host','check-stop'); await wait(()=>checkResults.get('host')?.liveTracks===0&&!checkResults.get('host')?.state.active,'Stopping device check releases tracks');
  action('host','check-delay'); await wait(()=>pendingCaptures.has('host'),'Device check capture is pending');
  action('host','check-stop'); action('host','release-capture'); await report();
  assert.equal(snapshot.get('host').liveTracks,0,'A cancelled device check discards late media tracks');
  pendingCaptures.delete('host');
  action('host','check-fail'); await wait(()=>!!checkResults.get('host')?.state.error,'Device check permission/device errors are actionable');
  assert.equal(checkResults.get('host').liveTracks,0); assert.equal(checkResults.get('host').state.active,false);
  action('host','check-start'); await wait(()=>checkResults.get('host')?.state.active,'Device check can restart after failure');
  action('host','check-stop'); await wait(()=>checkResults.get('host')?.liveTracks===0,'Repeated check releases devices');
  if (process.argv.includes('--check-only')) { console.log('DEVICE_CHECK_TEST_PASS: camera, meter, explicit monitor, latest Off wins, stop, late capture cancellation, failure and retry; generated devices, no hardware.'); return; }
  const requestStarted=Date.now();dropRequests.add('host');action('host','start');await wait(()=>reports.get('host')?.liveTracks===2,'Outgoing capture awaits a deliberately lost call request');
  await wait(()=>reports.get('host')?.liveTracks===0,'Lost call-request acknowledgement must end capture within 30 seconds',35000);
  const requestTimeoutMs=Date.now()-requestStarted;
  windows.get('host').webContents.send('harness:event', { type: 'action', action: 'start' });
  await wait(() => server.coordinator.snapshot?.phase === 'connected', 'Real local WebRTC must connect in both directions');
  await wait(() => [...reports.values()].filter(r => r.videoHeight > 0).length === 2, 'Both partners decode real synthetic video');
  await wait(() => [...reports.values()].filter(r => r.state?.stats?.receivedAudioPackets > 0).length === 2, 'Both partners receive actual audio packets');
  await report();
  for (const result of snapshot.values()) { assert.equal(result.peerState, 'connected'); assert.equal(result.liveTracks, 2); }
  assert.equal(snapshot.get('host').state.speakerEcho,'unavailable','Unsupported experimental cancellation keeps the normal generated-media call working');
  const mediaStatistics=[...snapshot].map(([role,result])=>({role,stats:result.state.stats}));
  action('host','use-device-video'); await wait(()=>reports.get('host')?.state?.stats?.captureHeight===720,'Initial HD camera preference reaches real generated getUserMedia track');
  for (const [quality,width,height] of [['1080',1920,1080],['360',640,360],['720',1280,720]]) {
    qualityResults.clear(); action('host',`quality${quality}`);
    await wait(()=>qualityResults.has('host'),'Quality constraints complete');
    assert.equal(qualityResults.get('host').capture.width,width); assert.equal(qualityResults.get('host').capture.height,height);
    await report(); assert.equal(snapshot.get('host').samePeer,true); assert.equal(snapshot.get('host').liveTracks,2);
  }
  qualityResults.clear(); action('host','fail-quality'); await wait(()=>qualityResults.has('host'),'A camera quality failure is actionable');
  assert.equal(qualityResults.get('host').failed,true); assert.equal(qualityResults.get('host').capture.height,720);
  action('host','camera'); await wait(()=>server.coordinator.snapshot?.media.host.video===false,'Disable camera after failed quality change');
  action('host','camera'); await wait(()=>reports.get('host')?.state?.stats?.captureHeight===720,'Failed quality must not become the preference for reacquired camera');
  action('host','use-canvas-video'); await wait(()=>reports.get('host')?.state?.stats?.captureHeight===360,'Return to synthetic canvas for controlled freeze tests');
  const callId = server.coordinator.snapshot.id;
  windows.get('host').webContents.send('harness:event', { v:1, type:'ice', callId, generation:999, candidate:null });
  windows.get('host').setMinimumSize(160,90); windows.get('host').setBounds({width:160,height:90}); windows.get('host').setBounds({width:400,height:300});
  await report(); assert.ok([...snapshot.values()].every(r=>r.samePeer&&r.transceivers===2));
  clients.get('guest').stop(); await wait(()=>server.coordinator.snapshot?.phase==='reconnecting','Observe real signaling outage');
  connect('guest'); await wait(()=>server.coordinator.snapshot?.phase==='connected','Resume the authenticated existing call');
  assert.equal(server.coordinator.snapshot.id,callId); await report(); assert.ok([...snapshot.values()].every(r=>r.samePeer));
  server.coordinator.receive('guest',{v:1,type:'recover',callId},Date.now());
  await wait(()=>server.coordinator.snapshot?.phase==='connected'&&server.coordinator.snapshot.generation===2,'Host-led ICE restart finishes using the original peers');
  await report(); assert.ok([...snapshot.values()].every(r=>r.samePeer&&r.transceivers===2));
  windows.get('host').webContents.send('harness:event', { type: 'action', action: 'camera' });
  await wait(() => server.coordinator.snapshot?.media.host.video === false && reports.get('host')?.liveTracks === 1, 'Camera off releases its actual track');
  windows.get('host').webContents.send('harness:event', { type: 'action', action: 'camera' });
  await wait(() => server.coordinator.snapshot?.media.host.video === true && reports.get('host')?.liveTracks === 2, 'Camera on replaces the existing sender track');
  windows.get('host').webContents.send('harness:event', { type: 'action', action: 'mute' });
  await wait(() => server.coordinator.snapshot?.media.host.audio === false, 'Mute disables transmitted audio');
  action('host','lose-camera'); await wait(()=>reports.get('host')?.state?.error?.includes('disconnected'),'Report a disappeared device');
  action('host','recover-devices'); await wait(()=>reports.get('host')?.liveTracks===2&&!reports.get('host')?.state.error,'Reacquire default devices without a second peer');
  await report(); assert.ok([...snapshot.values()].every(r=>r.samePeer)); assert.equal(snapshot.get('host').unsafeAudioReplacement,false,'Device recovery must disable a muted microphone BEFORE attaching it to its live sender');
  windows.get('host').webContents.send('harness:event', { type: 'action', action: 'hangup' });
  await wait(() => server.coordinator.snapshot === null && [...reports.values()].every(r => r.liveTracks === 0), 'Hangup closes both peers and releases all local tracks');
  action('host','delay-start'); await wait(()=>pendingCaptures.has('host'),'Capture request is deliberately pending');
  action('host','hangup'); action('host','release-capture');
  await report();
  await wait(()=>reports.get('host')?.liveTracks===0,'Late capture results must release all tracks');
  assert.equal(server.coordinator.snapshot,null);
  action('guest','delay-next-capture');action('host','start');
  await wait(()=>pendingCaptures.has('guest'),'Incoming acceptance is awaiting capture');
  action('host','hangup');await wait(()=>server.coordinator.snapshot===null&&reports.get('guest')?.state?.connection==='ended','Caller cancellation reaches the pending callee');
  action('guest','release-capture');await report();assert.ok([...reports.values()].every(r=>r.liveTracks===0));
  action('host','fail-video-start');await wait(()=>reports.get('host')?.state?.audioOnlyOffered,'Camera failure offers explicit audio-only continuation');
  assert.equal(server.coordinator.snapshot,null);action('host','audio-only-start');
  await wait(()=>server.coordinator.snapshot?.phase==='connected','Explicit audio-only continuation connects');
  assert.equal(server.coordinator.snapshot.media.host.video,false);await report();assert.equal(reports.get('host').liveTracks,1);
  action('host','camera');await wait(()=>server.coordinator.snapshot?.media.host.video===true,'Audio-only call can enable camera on its existing sender');
  action('host','hangup');await wait(()=>server.coordinator.snapshot===null&&[...reports.values()].every(r=>r.liveTracks===0),'Audio-only call ends cleanly');
  action('host','fail-audio-start');await wait(()=>reports.get('host')?.state?.error?.includes('Microphone unavailable'),'Microphone denial is actionable');
  assert.equal(server.coordinator.snapshot,null);assert.equal(reports.get('host').liveTracks,0);assert.equal(reports.get('host').state.audioOnlyOffered,false);
  for(const role of ['host','guest'])action(role,'reset-reference'); action('guest','start');
  await wait(()=>server.coordinator.snapshot?.phase==='connected','Second call starts after cancellation with the host still offering');
  await wait(()=>reports.get('guest')?.state?.stats?.receivedVideoFrames>0,'Second call receives video before the freeze');
  action('host','freeze-video');await wait(()=>reports.get('guest')?.state?.stale===true,'Media statistics detect frozen video',8000);
  const staleStarted=Date.now();
  await wait(()=>{assert.ok((server.coordinator.snapshot?.generation??2)<=2,'One frozen-video outage must not cause repeated ICE restarts');return server.coordinator.snapshot===null&&[...reports.values()].every(r=>r.liveTracks===0);},'Frozen video exhausts bounded recovery and releases both captures',35000);
  const staleRecoveryMs=Date.now()-staleStarted;
  action('guest','disable-auto-accept'); action('host','start');
  await wait(()=>server.coordinator.snapshot?.phase==='ringing','Unanswered call rings');
  const ringStarted=Date.now();
  await wait(()=>server.coordinator.snapshot===null&&[...reports.values()].every(r=>r.liveTracks===0),'Real 60-second ring timeout releases both captured tracks',65000);
  assert.ok(Date.now()-ringStarted>=59000,'The ringing test must use real elapsed time');
  const output=join(root,'out/verification');mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'media-integration.json'),JSON.stringify({timestamp:new Date().toISOString(),durationMs:Date.now()-startedAt,versions:process.versions,architecture:process.arch,
    generatedMedia:true,singleMac:true,iceServers:[],requestTimeoutMs,staleRecoveryMs,ringTimeoutMs:Date.now()-ringStarted,mediaStatistics,
    checks:['local camera/microphone check, meter, opt-in monitor, stop, late cancellation, error and retry','real getUserMedia denies before and succeeds after explicit permission authorization using generated test devices','bidirectional decoded video and audio packets','720p/1080p/360p apply to real generated camera without replacing peer or leaking tracks','early ICE','stale generation','same peers on resize/signaling recovery/ICE restart','camera stop and sender replacement','mute preserved before device replacement','outgoing and incoming late capture cancellation','explicit audio-only fallback','microphone denial','lost request cleanup','second call','frozen-video detection with one restart and bounded recovery cleanup','real 60-second ring timeout','all captured tracks released'],
    pending:['hardware capture/routing','actual two-Mac/two-network call','native full-screen movie on partner Mac','three-hour session','downloaded installation/update']},null,2)+'\n');
  console.log('MEDIA_TEST_PASS: real local WebRTC, bidirectional audio/video, early ICE, stale generation, persistent peers on resize/reconnect/ICE restart, camera off/on, mute preserved during recovery, outgoing/incoming late capture cancellation, explicit audio-only fallback, microphone denial, second call, real 60-second ring timeout and cleanup. Two-Mac/network/hardware acceptance remains untested.');
}).catch(error => { console.error('MEDIA_TEST_FAIL:', error.message, JSON.stringify({ phase: server?.coordinator.snapshot?.phase, traffic, reports: [...reports] })); process.exitCode = 1; }).finally(async () => {
  for (const client of clients.values()) client.stop(); if (server) await server.close();
  for (const timer of timers)clearTimeout(timer);
  for (const window of windows.values()) window.destroy(); app.exit(process.exitCode || 0);
});
