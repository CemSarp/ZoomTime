import { decodePreferences } from '../src/preferences.ts';
import { emptyCallingState, type CallingEvent } from '../src/calling-state.ts';
import type { ZoomTimeBridge, WindowState } from '../src/bridge.ts';
import type { UpdateState } from '../src/updates.ts';
import type { ScreenCaptureState } from '../src/screen-capture.ts';
import { MediaPeer } from '../src/media-peer.ts';

declare global { interface Window { uiHarness: { resize(width: number, height: number): Promise<void>; snapshot(name: string): Promise<void>; theme(value: 'light' | 'dark'): Promise<void>; result(value: unknown): void } } }
const $ = <T extends HTMLElement = HTMLButtonElement>(id: string) => document.getElementById(id) as T;
const assert = (ok: unknown, label: string) => { if (!ok) throw Error(label); };
const results: string[] = [], operations: string[] = [];
const peers: MediaPeer[] = [], applyPeer = MediaPeer.prototype.apply;
MediaPeer.prototype.apply = function (...args) { if (!peers.includes(this)) peers.push(this); return applyPeer.apply(this, args); };
const record = (name: string) => { operations.push(name); };
const wait = async (predicate: () => boolean, label: string) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error(label); };
const pass = (name: string) => results.push(name);
const self = '00000000-0000-4000-8000-000000000005';
let calling = emptyCallingState();
let state: WindowState = { mode: 'normal', bounds: { x: 0, y: 0, width: 900, height: 700 }, preferences: decodePreferences(null), preferencesError: false, fullScreen: false, minimized: false, alwaysOnTop: false };
let callEvent: (event: CallingEvent) => void = () => {}, windowEvent: (state: WindowState) => void = () => {}, updateEvent: (state: UpdateState) => void = () => {}, captureEvent: (state: ScreenCaptureState) => void = () => {};
let update: UpdateState = { currentVersion: '0.5.0', status: 'idle', message: 'Updates are checked only when you ask.' };
let capture: ScreenCaptureState = { active: false, busy: false, canReveal: false, message: 'Screen capture is off.' };
const emit = () => callEvent({ type: 'state', state: structuredClone(calling) });
function pair(): void {
  calling = { ...emptyCallingState(), role: 'host', hostId: self, selfId: self, groupId: 'ui-fixture', network: { state: 'online', message: 'Online' },
    members: ['Alex', 'Sam', 'Taylor', 'Jordan', 'You'].map((name, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, name, online: true })) }; emit();
}
function join(count: number, operationId = 'ui-operation'): void {
  const members = [self, ...calling.members.filter(m => m.id !== self).slice(0, count - 1).map(m => m.id)];
  calling.call = { id: 'ui-call', callerId: self, members: members.map(id => ({ id, status: 'joined', invitationId: null, invitedById: null, expiresAt: null, operationId: id === self ? operationId : null, media: { audio: true, video: true } })),
    pairs: members.slice(1).map(id => ({ id: `pair-${id}`, a: id, b: self, offererId: id, generation: 1, phase: 'connecting' })) }; emit();
}
const bridge: ZoomTimeBridge = {
  getState: async () => state, getCallingState: async () => calling, getUpdateState: async () => update, getScreenCaptureState: async () => capture,
  onState: fn => { windowEvent = fn; return () => {}; }, onCallEvent: fn => { callEvent = fn; return () => {}; }, onUpdateState: fn => { updateEvent = fn; return () => {}; }, onScreenCaptureState: fn => { captureEvent = fn; return () => {}; }, onSettings: () => () => {},
  setMode: async mode => { state = { ...state, mode }; record(mode); await window.uiHarness.resize(mode === 'mini' ? 320 : 900, mode === 'mini' ? 180 : 700); windowEvent(state); return state; },
  restore: async () => { record('restore'); return bridge.setMode('normal'); }, minimize: async () => { record('minimize'); }, close: async () => { record('close'); },
  setFullScreen: async value => { record('fullscreen'); state.fullScreen = value; windowEvent(state); return state; },
  setPreferences: async preferences => { record('preferences'); state = { ...state, preferences }; windowEvent(state); return state; },
  setupHost: async () => { record('host'); pair(); }, createHost: async () => { record('manual-host'); pair(); }, importInvitation: async () => { record('import'); pair(); },
  retryConnection: async () => { record('retry'); calling.network.state = 'online'; emit(); }, resetPairing: async () => { record('reset'); calling = emptyCallingState(); emit(); },
  addMember: async name => { record('add'); calling.members.push({ id: 'extra', name, online: true }); emit(); },
  renameMember: async (id, name) => { record('rename'); calling.members.find(m => m.id === id)!.name = name; emit(); },
  copyInvitation: async () => { record('copy'); }, revokeMember: async id => { record('revoke'); calling.members = calling.members.filter(m => m.id !== id); emit(); },
  authorizeDeviceCheck: async () => { assert(!$<HTMLVideoElement>('check-video').srcObject, 'An existing check lease cannot be authorized again'); record('check-authorize'); }, releaseDeviceCheck: async () => { record('check-release'); },
  authorizeCapture: async () => { record('capture-authorize'); }, releaseCapture: async () => { record('capture-release'); },
  sendSignal: async message => { record(message.type); if (message.type === 'request' || message.type === 'accept') join(2, message.operationId);
    if (message.type === 'hangup' || message.type === 'cancel' || message.type === 'reject') { calling.call = null; emit(); } },
  openScreenCaptureSettings: async () => { record('screen-settings'); }, discoverScreenSources: async request => { record(request ? 'screen-request' : 'screen-refresh'); return { displays: [{ id: 1, width: 1920, height: 1080 }], windows: [] }; },
  startScreenCapture: async () => { record('screen-start'); capture = { ...capture, active: true, canReveal: true, message: 'Synthetic diagnostic running' }; captureEvent(capture); },
  stopScreenCapture: async () => { record('screen-stop'); capture = { ...capture, active: false, message: 'Screen capture is off.' }; captureEvent(capture); }, revealScreenCapture: async () => { record('screen-reveal'); },
  checkForUpdates: async () => { record('update-check'); update = { ...update, status: 'available', version: '0.5.1', message: 'Synthetic update available' }; updateEvent(update); },
  downloadUpdate: async () => { record('update-download'); update = { ...update, status: 'ready', message: 'Synthetic update staged' }; updateEvent(update); },
  installUpdate: async () => { record('update-install'); throw Error('Finish your call before restarting.'); }, revealUpdate: async () => { record('update-reveal'); throw Error('Synthetic recovery error'); },
};
window.zoomtime = bridge;
window.confirm = () => true;
const click = (id: string) => { assert(!$(id).hidden && !$(id).disabled, `${id} must be actionable`); $(id).click(); };
const change = (id: string, value: string) => { $<HTMLInputElement>(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function run(): Promise<void> {
  await import('../src/renderer.ts'); await wait(() => document.body.dataset.mode === 'normal', 'Renderer initialized');
  assert($('mini-people').hidden, 'Unpaired People action hidden'); assert($('mini-mute').disabled && $('mini-camera').disabled, 'No capture controls before a call');
  assert(document.querySelectorAll('button').length === 41, 'Audit every static button');
  pass('41 static button handlers inventoried; unpaired disabled actions');
  click('host'); await wait(() => !document.querySelector('#contacts button:disabled'), 'Host setup completes');
  assert($('retry').hidden, 'Online retry is redundant'); assert($('add-member').disabled, 'Capacity disables add');
  for (const button of document.querySelectorAll<HTMLButtonElement>('#contacts button')) assert(button.getAttribute('aria-label')?.includes(' · '), 'Member-specific action labels');
  const rename = document.querySelector<HTMLButtonElement>('#contacts button[aria-label="Rename · Alex"]')!; rename.focus(); rename.click();
  await wait(() => $<HTMLDialogElement>('rename-member').open, 'Rename opens');
  $('rename-cancel').click(); await frame(); assert(document.activeElement === rename, 'Rename returns focus');
  rename.click(); await frame(); state.fullScreen = true;
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); document.dispatchEvent(escape);
  assert(state.fullScreen && !operations.includes('fullscreen'), 'Rename Escape cannot exit fullscreen'); state.fullScreen = false;
  await bridge.setMode('mini'); assert(!$<HTMLDialogElement>('rename-member').open, 'Mini closes Rename'); await bridge.restore();
  rename.click(); await frame(); $<HTMLInputElement>('rename-name').value = 'Alexandra'; $('rename-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await wait(() => !$<HTMLDialogElement>('rename-member').open, 'Rename saves');
  document.querySelector<HTMLButtonElement>('#contacts button[aria-label="Copy invitation · Alexandra"]')!.click(); await wait(() => operations.includes('copy'), 'Copy invitation handler'); await frame();
  document.querySelector<HTMLButtonElement>('#contacts button[aria-label="Revoke · Alexandra"]')!.click(); await wait(() => calling.members.length === 4, 'Revoke handler'); await frame();
  $<HTMLInputElement>('member-name').value = 'Morgan'; $('member-form').dispatchEvent(new Event('submit', { cancelable: true })); await wait(() => calling.members.length === 5, 'Add member handler'); await frame(); pair();
  pass('Member capacity, named actions, add/copy/rename/revoke, modal focus/Escape/Mini cleanup');
  (() => { const input = document.querySelector<HTMLInputElement>('#contacts input:not(:disabled)')!; input.checked = true; input.dispatchEvent(new Event('change')); })(); click('call');
  await wait(() => !!$<HTMLVideoElement>('local').srcObject && !$('mute').hidden, 'Call captures generated devices');
  const video = $<HTMLVideoElement>('local'), stream = video.srcObject;
  assert($('mute').textContent === '' && $('camera').textContent === '', 'Normal controls are symbols');
  click('mute'); assert($('mute').getAttribute('aria-label') === 'Unmute microphone' && $('mini-mute').dataset.off === 'true', 'Mute icon synced in both modes');
  assert(!(stream as MediaStream).getAudioTracks()[0].enabled, 'Mute disables actual generated microphone');
  click('mini-mute'); assert((stream as MediaStream).getAudioTracks()[0].enabled, 'Mini unmute restores microphone');
  click('camera'); await wait(() => $('camera').dataset.off === 'true', 'Camera off icon'); assert((stream as MediaStream).getVideoTracks().length === 0, 'Camera off releases track');
  click('mini-camera'); await wait(() => $('camera').dataset.off === 'false', 'Camera on icon');
  assert(video === $<HTMLVideoElement>('local') && stream === video.srcObject, 'Controls preserve shared stream and element');
  click('mute'); click('open-settings');
  const microphoneBeforeEcho = (stream as MediaStream).getAudioTracks()[0], cameraBeforeEcho = (stream as MediaStream).getVideoTracks()[0], connectionBeforeEcho = peers[0].connection, callBeforeEcho = calling.call!.id;
  assert(!$<HTMLDetailsElement>('speaker-echo-info').open, 'Echo explanation starts collapsed');
  assert(document.querySelector('label[for="speaker-echo-reduction"] strong')!.textContent === 'Reduce speaker echo', 'Echo title has no Experimental wording');
  const captureEcho = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); let releaseEcho!: () => void;
  navigator.mediaDevices.getUserMedia = async constraints => { const result = await captureEcho(constraints); await new Promise<void>(resolve => { releaseEcho = resolve; }); return result; };
  click('speaker-echo-reduction'); await wait(() => !!releaseEcho, 'Live microphone capture is pending'); windowEvent(structuredClone(state));
  assert($<HTMLInputElement>('speaker-echo-reduction').checked && $('speaker-echo-reduction').disabled, 'Geometry updates preserve the in-flight echo choice');
  releaseEcho(); await wait(() => !$('speaker-echo-reduction').disabled, 'Live echo enable completes'); navigator.mediaDevices.getUserMedia = captureEcho;
  assert(microphoneBeforeEcho.readyState === 'ended' && !(stream as MediaStream).getAudioTracks()[0].enabled, 'Live echo replaces only a muted microphone');
  assert((stream as MediaStream).getAudioTracks()[0].getSettings().echoCancellation === 'all', 'Generated microphone actually uses all mode');
  click('speaker-echo-reduction'); await wait(() => !$('speaker-echo-reduction').disabled, 'Live echo disable completes');
  assert((stream as MediaStream).getAudioTracks()[0].getSettings().echoCancellation === 'remote-only', 'Disabling actually returns to call-only cancellation');
  assert(video.srcObject === stream && (stream as MediaStream).getVideoTracks()[0] === cameraBeforeEcho && cameraBeforeEcho.readyState === 'live' && peers[0].connection === connectionBeforeEcho && calling.call!.id === callBeforeEcho, 'Echo changes preserve call, stream, camera and peer');
  assert(!(stream as MediaStream).getAudioTracks()[0].enabled, 'Disabled echo preserves mute');
  $<HTMLDetailsElement>('speaker-echo-info').open = true; $('speaker-echo-info').scrollIntoView({ block: 'center' }); await frame(); await window.uiHarness.snapshot('live-speaker-echo-info');
  click('settings-close'); click('mute'); pass('Live all/remote-only echo toggle, collapsed explanation, unchanged camera/stream/peer/call and mute');
  const playback = document.querySelector<HTMLVideoElement>('.video-tile video')!, play = playback.play;
  playback.play = async () => { throw new DOMException('Synthetic autoplay denial', 'NotAllowedError'); };
  await peers[0].resumeAudio().catch(() => {}); assert(!$('resume-audio').hidden, 'Autoplay failure offers explicit Resume audio');
  playback.play = async () => { record('audio-resume'); }; click('resume-audio'); await wait(() => !!$('resume-audio').hidden, 'Resume clears playback error'); playback.play = play;
  pass('Normal/Mini stateful symbols, accessible next actions, real fake-device mute/camera');
  const available = document.querySelector<HTMLInputElement>('#contacts input:not(:disabled)'); assert(available, 'In-call invite targets available'); available!.checked = true; available!.dispatchEvent(new Event('change')); click('invite-members'); assert(operations.includes('invite'), 'In-call invite dispatch');
  const statusNode = $('status').firstChild; emit(); assert($('status').firstChild === statusNode, 'Identical status retains live text node');
  for (const count of [2, 3, 4, 5]) {
    join(count); assert(document.querySelectorAll('.video-tile').length === count - 1, 'Participant count');
    assert(document.querySelector<HTMLButtonElement>('.pin-person')!.hidden === (count === 2), 'Single tile hides redundant pin');
    await frame(); await window.uiHarness.snapshot(`group-${count}-normal`);
  }
  const remote = document.querySelector('.video-tile video'); document.querySelector<HTMLButtonElement>('.pin-person')!.click();
  assert($('remote-grid').dataset.pinned === 'true', 'Pin works'); change('focus-person', ''); assert($('remote-grid').dataset.pinned === 'false', 'Grid works');
  const slider = document.querySelector<HTMLInputElement>('.participant-volume input')!; slider.value = '40'; slider.dispatchEvent(new Event('input'));
  assert(document.querySelector<HTMLVideoElement>('.video-tile video')!.volume === .4, 'Individual gain applies once');
  change('output-volume', '50'); await wait(() => !$('output-volume').disabled, 'Master preference saves'); assert(document.querySelector<HTMLVideoElement>('.video-tile video')!.volume === .2, 'Master and person gains multiply');
  for (const theme of ['light', 'dark'] as const) { await window.uiHarness.theme(theme); for (const [width, height] of [[320, 180], [160, 90]]) {
    await bridge.setMode('mini'); await window.uiHarness.resize(width, height); await frame();
    const summary = document.querySelector<HTMLElement>('#call-menu summary')!;
    assert(getComputedStyle(summary).listStyleType === 'none' && summary.querySelectorAll('circle').length === 3, 'Only three dots, no disclosure arrow');
    for (const id of ['mini-mute', 'mini-camera', 'mini-self', 'restore', 'close']) { const r = $(id).getBoundingClientRect(); assert(r.width >= 28 && r.height >= 32 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, `${id} fits minimum Mini`); }
    assert(document.querySelector('.video-tile video') === remote, 'Mode/theme retains video identity');
    await window.uiHarness.snapshot(`group-5-mini-${width}-${theme}`);
    $<HTMLDetailsElement>('call-menu').open = true; $('output-volume').focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!$<HTMLDetailsElement>('call-menu').open && document.activeElement === summary && state.mode === 'mini', 'Escape closes menu before restoring Mini and returns focus');
    $<HTMLDetailsElement>('call-menu').open = true; $('local').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); assert(!$<HTMLDetailsElement>('call-menu').open, 'Outside click dismisses menu');
    $<HTMLDetailsElement>('call-menu').open = true; document.querySelector('.participant-volume:last-child input')!.scrollIntoView({ block: 'nearest' }); await frame(); await window.uiHarness.snapshot(`group-5-menu-${width}-${theme}`);
    $<HTMLDetailsElement>('call-menu').open = false;
  } }
  $<HTMLDetailsElement>('call-menu').open = true; click('mini-people'); await wait(() => state.mode === 'normal' && document.activeElement === $('group'), 'People restores and focuses contacts'); window.scrollTo(0, 0);
  await bridge.restore(); assert(document.querySelector('.video-tile video') === remote, 'Final restored video identity'); click('hangup'); await wait(() => !video.srcObject, 'Leave releases capture');
  pass('2–5 participant stable layouts, pin, volume, three-dot menu, both Mini sizes/themes, dismissal/focus, cleanup');
  await window.uiHarness.resize(640, 420); for (const member of calling.members) member.name = member.name[0].repeat(40); emit();
  for (const input of document.querySelectorAll<HTMLInputElement>('#contacts input:not(:disabled)')) { input.checked = true; input.dispatchEvent(new Event('change')); }
  await frame(); assert(document.documentElement.scrollWidth <= innerWidth && $('call').getBoundingClientRect().right <= innerWidth, 'Four maximum-length recipient names fit minimum Normal width'); await window.uiHarness.snapshot('long-names-normal-minimum'); pair(); await window.uiHarness.resize(900, 700);
  const incoming = () => { join(2); calling.call!.callerId = calling.members[0].id; calling.call!.pairs = []; const own = calling.call!.members.find(m => m.id === self)!; own.status = 'invited'; own.invitationId = 'synthetic-invitation'; emit(); };
  incoming(); click('reject'); await wait(() => !calling.call, 'Decline ends local invitation');
  incoming(); click('accept'); await wait(() => !!video.srcObject && !$('mute').hidden, 'Accept joins with explicit capture');
  const lostMic = (video.srcObject as MediaStream).getAudioTracks()[0]; lostMic.stop(); lostMic.dispatchEvent(new Event('ended')); assert(!$('devices').hidden, 'Device failure offers recovery');
  click('devices'); await wait(() => (video.srcObject as MediaStream).getAudioTracks()[0].readyState === 'live' && !!$('devices').hidden, 'Device recovery acquires current input');
  calling.call!.pairs = []; emit(); click('cancel'); await wait(() => !video.srcObject, 'Cancel releases capture');
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); let failCapture = true;
  navigator.mediaDevices.getUserMedia = constraints => failCapture ? (failCapture = false, Promise.reject(new DOMException('Synthetic permission denial', 'NotAllowedError'))) : getUserMedia(constraints);
  (() => { const input = document.querySelector<HTMLInputElement>('#contacts input:not(:disabled)')!; input.checked = true; input.dispatchEvent(new Event('change')); })(); click('call'); await wait(() => !$('audio-only').hidden, 'Capture failure offers explicit microphone-only retry');
  click('audio-only'); await wait(() => !!video.srcObject && !$('mute').hidden, 'Audio-only retry joins'); assert((video.srcObject as MediaStream).getVideoTracks().length === 0, 'Audio-only acquires no camera');
  click('hangup'); await wait(() => !video.srcObject, 'Audio-only cleanup'); navigator.mediaDevices.getUserMedia = getUserMedia;
  pass('Call/Accept/Decline/Cancel/Leave/Invite and generated-device recovery/audio-only paths');
  click('open-settings'); click('update-check'); await frame(); click('update-download'); await frame(); assert($('update-check').disabled, 'Staged update disables no-op Check');
  click('update-install'); await wait(() => !$('settings-error').hidden, 'Restart guard feedback in modal');
  assert($('settings-error').textContent?.includes('Finish your call'), 'Restart rejection is visible');
  update = { ...update, canReveal: true }; updateEvent(update); click('update-reveal'); await wait(() => $('settings-error').textContent === 'Synthetic recovery error', 'Reveal errors visible in modal');
  for (const id of ['normal-always-on-top', 'mini-always-on-top', 'mirror', 'mini-self-setting', 'speaker-echo-reduction']) { $(id).click(); await wait(() => !$(id).disabled, `${id} persists`); }
  change('quality', '360p'); await wait(() => !$('quality').disabled, 'Quality persists'); change('preview-size', '35'); await wait(() => !$('preview-size').disabled, 'Preview persists');
  click('check-start'); await wait(() => !!$<HTMLVideoElement>('check-video').srcObject && !$('check-listen').disabled, 'Device check starts explicitly');
  click('check-listen'); await wait(() => $<HTMLInputElement>('check-listen').checked, 'Monitoring toggles on');
  const checkStream = $<HTMLVideoElement>('check-video').srcObject as MediaStream, checkCamera = checkStream.getVideoTracks()[0], checkMicrophone = checkStream.getAudioTracks()[0];
  for (const enabled of [false, true]) { click('speaker-echo-reduction'); await wait(() => !$('speaker-echo-reduction').disabled, 'Device check echo change finishes'); assert(checkStream.getAudioTracks()[0].getSettings().echoCancellation === (enabled ? 'all' : 'remote-only'), 'Check echo mode actually changes'); }
  assert(checkMicrophone.readyState === 'ended' && checkStream === $<HTMLVideoElement>('check-video').srcObject && checkCamera === checkStream.getVideoTracks()[0] && checkCamera.readyState === 'live' && $<HTMLInputElement>('check-listen').checked, 'Live check echo retains camera, preview, meter graph and listening');
  click('check-listen'); click('check-stop'); await wait(() => !$<HTMLVideoElement>('check-video').srcObject, 'Stop check releases devices');
  click('screen-request'); await frame(); click('screen-refresh'); await frame(); click('screen-settings'); click('screen-start'); await frame(); click('screen-reveal'); click('screen-stop');
  await frame(); assert(!capture.active, 'Screen stop handler');
  for (const theme of ['light', 'dark'] as const) { await window.uiHarness.theme(theme); await new Promise(resolve => setTimeout(resolve, 180)); assert(getComputedStyle($('settings-close')).backgroundColor === (theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(48, 51, 61)'), 'Theme keeps button surface legible'); $('settings').scrollTop = 0; await frame(); await window.uiHarness.snapshot(`settings-${theme}`); }
  click('settings-close'); click('mini'); await wait(() => state.mode === 'mini', 'Mini button');
  assert($('mini-status').textContent === 'Synthetic recovery error', 'Mini retains actionable error feedback'); click('mini-self'); await wait(() => !$('mini-self').disabled, 'Mini self-preview preference'); click('restore'); await wait(() => state.mode === 'normal', 'Restore button');
  click('minimize-window'); await bridge.setMode('mini'); click('close'); assert(operations.includes('close'), 'Idle Mini close dispatch'); await bridge.restore();
  pass('Settings toggles/selects, updater staging/guard/errors, mocked diagnostic actions, compact errors, native action dispatch');
  calling.network.state = 'offline'; emit(); click('retry'); await wait(() => !!$('retry').hidden, 'Retry disappears on reconnect');
  click('reset'); await wait(() => !calling.role, 'Reset handler'); await frame(); click('import'); await wait(() => !!calling.role, 'Import handler'); await frame();
  calling = emptyCallingState(); emit(); $<HTMLInputElement>('endpoint').value = 'wss://synthetic.tail.ts.net:8443/zoomtime'; $('host-form').dispatchEvent(new Event('submit', { cancelable: true })); await wait(() => operations.includes('manual-host'), 'Manual setup handler');
  pass('Retry/reset/import/manual setup route to existing bridge');
  window.uiHarness.result({ ok: true, results, operations, scope: 'Product renderer with synthetic bridge/call snapshots and generated devices; no real pairing, capture diagnostics, updater installation or network acceptance.' });
}
void run().catch(error => window.uiHarness.result({ ok: false, error: error instanceof Error ? error.stack : String(error), results, operations }));
