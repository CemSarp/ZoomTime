import stylesheet from './index.css';
import { MediaCall } from './media-call.ts';
import type { CallingState } from './calling-service.ts';
import type { WindowState } from './bridge.ts';
const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = stylesheet; document.head.append(link);
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const show = (id: string, visible: boolean) => { element(id).hidden = !visible; };
const disabled = (id: string, value: boolean) => { element<HTMLButtonElement>(id).disabled = value; };
const rendererSession = crypto.randomUUID(); document.body.dataset.rendererSession = rendererSession; element('session').textContent = rendererSession.slice(0, 8);
const startedAt = Date.now(); let connectedAt: number | null = null;
let windowState: WindowState | null = null;
let calling: CallingState = { role: null, endpoint: null, call: null, peerOnline: false, network: { state: 'offline', message: 'Pair your Macs to begin.' }, error: null };
let action: 'call' | 'accept' = 'call'; let setupBusy = false; let uiError = ''; let playbackResumed = false;
const remote = element<HTMLVideoElement>('remote'), local = element<HTMLVideoElement>('local');
const media = new MediaCall(window.zoomtime, { local, remote, changed: () => render() });
function error(error: unknown): void { uiError = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'That action failed. Check the connection and retry.'; render(); }
function run(operation: () => Promise<unknown>): void { uiError = ''; void operation().catch(error); }
async function setup(operation: () => Promise<void>): Promise<void> {
  if (setupBusy) return; setupBusy = true; uiError = ''; render();
  try { await operation(); } catch (cause) { error(cause); } finally { setupBusy = false; render(); }
}
function applyWindow(state: WindowState): void {
  windowState = state; document.body.dataset.mode = state.mode;
  element('size').textContent = `${state.bounds.width} × ${state.bounds.height}`; show('preferences', state.preferencesError);
}
function applyCalling(state: CallingState): void { calling = state; media.handleState(state); render(); }
function render(): void {
  const state = media.state, call = calling.call, active = !!call && call.phase !== 'ringing';
  const incoming = call?.phase === 'ringing' && call.caller !== calling.role;
  const outgoing = call?.phase === 'ringing' && !incoming;
  const ready = !!calling.role && calling.peerOnline && calling.network.state === 'online' && !call;
  const localActive = !!local.srcObject;
  const partner = calling.role === 'host' ? 'guest' : 'host';
  const reconnecting = !!call && (call.phase === 'reconnecting' || calling.network.state !== 'online' || state.stale || state.connection === 'disconnected' || state.connection === 'failed');
  let status = !calling.role ? 'Pair your Macs' : calling.network.state !== 'online' ? calling.network.message : !call ? calling.peerOnline ? 'Ready to call' : 'Waiting for your partner' :
    incoming ? 'Incoming call' : outgoing ? 'Calling your partner…' : reconnecting ? 'Reconnecting…' : state.connection === 'connected' ? 'Connected' : 'Connecting media…';
  if (state.capturing) status = 'Waiting for camera/microphone…';
  element('status').textContent = status;
  element('mini-status').textContent = status;
  show('onboarding', !calling.role); show('paired', !!calling.role || !!calling.error);
  element('pairing-status').textContent = calling.role === 'host' ? 'This Mac hosts your private calls.' : calling.role === 'guest' ? 'Paired with your partner’s host.' : 'Secure pairing needs recovery.';
  show('copy-invitation', calling.role === 'host'); disabled('copy-invitation', setupBusy);
  for (const id of ['host', 'import', 'retry', 'reset']) disabled(id, setupBusy);
  show('call', !call && !state.capturing && !localActive); disabled('call', !ready || state.capturing);
  show('accept', !!incoming && !state.capturing); show('reject', !!incoming && !state.capturing);
  show('cancel', !!outgoing || state.capturing || (localActive && !call));
  for (const id of ['mute', 'camera', 'hangup']) show(id, active);
  for (const id of ['mute', 'camera', 'mini-mute', 'mini-camera']) disabled(id, !localActive || state.capturing);
  for (const id of ['mute', 'mini-mute']) {
    const button = element<HTMLButtonElement>(id), label = state.muted ? 'Unmute microphone' : 'Mute microphone';
    button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(state.muted));
    button.textContent = id === 'mute' ? label : state.muted ? 'Muted' : 'Mic';
  }
  for (const id of ['camera', 'mini-camera']) {
    const button = element<HTMLButtonElement>(id), label = state.cameraOn ? 'Turn camera off' : 'Turn camera on';
    button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(!state.cameraOn));
    button.textContent = id === 'camera' ? label : state.cameraOn ? 'Cam' : 'Off';
  }
  const closeLabel = call || state.capturing || localActive ? 'End call' : 'Close ZoomTime'; element('close').title = closeLabel; element('close').setAttribute('aria-label', closeLabel);
  show('local', localActive && state.cameraOn);
  const videoVisible = active && state.connection === 'connected' && !reconnecting && !!call.media[partner].video && remote.readyState >= 2;
  show('empty', !videoVisible);
  element('partner-title').textContent = state.capturing ? 'Waiting for permission…' : incoming ? 'Your partner is calling.' : outgoing ? 'Calling…' : reconnecting ? 'Reconnecting…' :
    active ? state.connection !== 'connected' ? 'Connecting…' : !call.media[partner].video ? 'Partner’s camera is off' : 'Waiting for video…' : 'A window for the two of you.';
  element('partner-detail').textContent = !calling.role ? 'Pair your Macs, then start a private call.' : !calling.peerOnline ? 'Both apps and Tailscale must be open.' : !call ? 'Ready for an evening together.' : reconnecting ? 'Working media continues during a brief signaling outage.' : 'Your partner’s video will appear here.';
  let message = uiError || calling.error || state.error || '';
  if (playbackResumed && message === 'Click Resume audio to start partner playback.') message = '';
  element('error').textContent = message; show('error', !!message);
  show('audio-only', state.audioOnlyOffered && !state.capturing);
  show('devices', active && !!state.error && !state.capturing);
  show('resume-audio', state.error === 'Click Resume audio to start partner playback.' && !playbackResumed);
  if (!call) { connectedAt = null; playbackResumed = false; }
  else if (state.connection === 'connected') connectedAt ??= Date.now();
  element('statistics').textContent = JSON.stringify({ signaling: calling.network.state, call: call?.phase ?? (calling.role ? 'ready' : 'unpaired'), ...state.stats,
    ...(connectedAt ? { connectedSeconds: Math.floor((Date.now() - connectedAt) / 1000) } : {}) }, null, 2);
}
element('host-form').addEventListener('submit', event => { event.preventDefault(); void setup(() => window.zoomtime.createHost(element<HTMLInputElement>('endpoint').value.trim())); });
element('import').addEventListener('click', () => { void setup(() => window.zoomtime.importInvitation()); });
element('copy-invitation').addEventListener('click', () => { void setup(async () => { await window.zoomtime.copyInvitation(); element('toast').textContent = 'Invitation copied. It contains a secret; share it only with your partner.'; }); });
element('retry').addEventListener('click', () => { void setup(() => window.zoomtime.retryConnection()); });
element('reset').addEventListener('click', () => { media.stop(); void setup(() => window.zoomtime.resetPairing()); });
element('call').addEventListener('click', () => { action = 'call'; run(() => media.start('call')); });
element('accept').addEventListener('click', () => { action = 'accept'; run(() => media.start('accept')); });
element('audio-only').addEventListener('click', () => run(() => media.start(action, true)));
for (const id of ['reject', 'cancel', 'hangup']) element(id).addEventListener('click', () => media.hangup());
for (const id of ['mute', 'mini-mute']) element(id).addEventListener('click', () => media.toggleMute());
for (const id of ['camera', 'mini-camera']) element(id).addEventListener('click', () => run(() => media.toggleCamera()));
element('devices').addEventListener('click', () => run(() => media.retryDevices()));
element('resume-audio').addEventListener('click', () => run(async () => { await remote.play(); playbackResumed = true; render(); }));
element('mini').addEventListener('click', () => run(() => window.zoomtime.setMode('mini').then(applyWindow)));
element('restore').addEventListener('click', () => run(() => window.zoomtime.restore().then(applyWindow)));
element('close').addEventListener('click', () => { if (calling.call || media.state.capturing || local.srcObject) media.hangup(); else run(() => window.zoomtime.close()); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && windowState?.mode === 'mini') { event.preventDefault(); run(() => window.zoomtime.restore().then(applyWindow)); } });
remote.addEventListener('loadeddata', render);
window.addEventListener('beforeunload', () => media.stop());
window.zoomtime.onState(applyWindow);
window.zoomtime.onCallEvent(event => { if (event.type === 'state') applyCalling(event.state); else if (event.type === 'stop') media.stop(event.reason); else void media.handleSignal(event.message); });
run(async () => { applyWindow(await window.zoomtime.getState()); applyCalling(await window.zoomtime.getCallingState()); });
setInterval(() => { const seconds = Math.floor((Date.now() - startedAt) / 1000); element('elapsed').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }, 1000);
render();
