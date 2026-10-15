import { MediaCall } from '../src/media-call.ts';
import type { CallingState } from '../src/calling-service.ts';
import type { ClientMessage, ServerMessage } from '../src/protocol.ts';
declare global {
  interface Window { harness: { send(message: ClientMessage): Promise<void>; authorize(action: string): Promise<void>; release(): Promise<void>; event(callback: (message: ServerMessage | { type: 'action'; action: string }) => void): void; result(value: unknown): void } }
}
const systemCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
async function probePermissions(): Promise<void> {
  let denied = false;
  try { const stream = await systemCapture({audio:true,video:true}); stream.getTracks().forEach(t=>t.stop()); }
  catch (error) { denied = (error as Error).name === 'NotAllowedError'; }
  await window.harness.authorize('call');
  try {
    const stream = await systemCapture({audio:true,video:true}); const kinds = stream.getTracks().map(t=>t.kind).sort(); stream.getTracks().forEach(t=>t.stop());
    window.harness.result({type:'permission-probe',denied,kinds});
  } catch (error) { window.harness.result({type:'permission-probe',denied,error:(error as Error).name}); }
  finally { await window.harness.release(); }
}
const captured: MediaStreamTrack[] = [];
const freezeVideo = new Map<MediaStreamTrack, () => void>();
let delayNext = false, releasePending: (() => void) | null = null, autoAccept = true;
let failVideo = false, failAudio = false, useDeviceVideo = false;
let firstPeer: RTCPeerConnection | null = null;
let mustStayMuted = false, unsafeAudioReplacement = false;
const replaceTrack = RTCRtpSender.prototype.replaceTrack;
RTCRtpSender.prototype.replaceTrack = function(track) {
  if(mustStayMuted && track?.kind==='audio' && track.enabled)unsafeAudioReplacement=true;
  return replaceTrack.call(this,track);
};
const audio = new AudioContext();
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async (constraints: MediaStreamConstraints) => {
  if(failVideo&&constraints.video){failVideo=false;throw new DOMException('Test camera unavailable','NotReadableError');}
  if(failAudio&&constraints.audio){failAudio=false;throw new DOMException('Test microphone denied','NotAllowedError');}
  const tracks: MediaStreamTrack[] = [];
  if (constraints.video && useDeviceVideo) {
    const stream = await systemCapture({ audio: false, video: constraints.video }); tracks.push(...stream.getVideoTracks());
  } else if (constraints.video) {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    let stopped = false;
    const draw = (time: number) => { if(stopped)return; ctx.fillStyle = `hsl(${time / 10 % 360},60%,40%)`; ctx.fillRect(0, 0, 640, 360); requestAnimationFrame(draw); }; requestAnimationFrame(draw);
    const track = canvas.captureStream(24).getVideoTracks()[0], stop = track.stop.bind(track);
    freezeVideo.set(track, () => { stopped = true; });
    track.stop = () => { stopped = true; stop(); }; tracks.push(track);
  }
  if (constraints.audio) {
    const oscillator = audio.createOscillator(), output = audio.createMediaStreamDestination(); oscillator.connect(output); oscillator.start(); await audio.resume();
    const track = output.stream.getAudioTracks()[0], stop = track.stop.bind(track); let stopped = false;
    track.stop = () => { if(!stopped){stopped=true;oscillator.stop();}stop(); }; tracks.push(track);
  }
  captured.push(...tracks);
  if (delayNext) { delayNext = false; window.harness.result({ type: 'capture-pending' }); await new Promise<void>(resolve => { releasePending = resolve; }); }
  return new MediaStream(tracks);
} });
const local = document.querySelector<HTMLVideoElement>('#local')!, remote = document.querySelector<HTMLVideoElement>('#remote')!;
local.muted = true; remote.muted = true;
const call = new MediaCall({ authorizeCapture: action => window.harness.authorize(action), releaseCapture: () => window.harness.release(), sendSignal: m => window.harness.send(m) },
  { local, remote, changed: state => window.harness.result({ type: 'media', state, liveTracks: captured.filter(t => t.readyState === 'live').length, videoHeight: remote.videoHeight }) });
let latest: CallingState;
window.harness.event(message => {
  if (message.type === 'action') {
    if (message.action === 'probe-permissions') void probePermissions();
    if (message.action === 'use-device-video') { useDeviceVideo = true; void call.retryDevices(); }
    if (message.action === 'use-canvas-video') { useDeviceVideo = false; void call.retryDevices(); }
    if (message.action === 'fail-quality') {
      const track = (local.srcObject as MediaStream).getVideoTracks()[0], apply = track.applyConstraints.bind(track);
      track.applyConstraints = async () => { throw new DOMException('Test camera cannot change resolution', 'OverconstrainedError'); };
      void call.setQuality('1080p').then(() => window.harness.result({ type: 'quality', unexpected: true }), error => window.harness.result({ type: 'quality', failed: true, error: error.message, capture: track.getSettings() })).finally(() => { track.applyConstraints = apply; });
    }
    if (message.action === 'quality720') void call.setQuality('720p').then(() => window.harness.result({ type: 'quality', quality: '720p', capture: local.srcObject instanceof MediaStream ? local.srcObject.getVideoTracks()[0]?.getSettings() : null }));
    if (message.action === 'quality1080') void call.setQuality('1080p').then(() => window.harness.result({ type: 'quality', quality: '1080p', capture: local.srcObject instanceof MediaStream ? local.srcObject.getVideoTracks()[0]?.getSettings() : null }));
    if (message.action === 'quality360') void call.setQuality('360p').then(() => window.harness.result({ type: 'quality', quality: '360p', capture: local.srcObject instanceof MediaStream ? local.srcObject.getVideoTracks()[0]?.getSettings() : null }));
    if (message.action === 'start') { mustStayMuted=false; void call.start('call'); }
    if (message.action === 'camera') void call.toggleCamera();
    if (message.action === 'mute') { call.toggleMute(); mustStayMuted=call.state.muted; }
    if (message.action === 'hangup') call.hangup();
    if (message.action === 'recover-devices') void call.retryDevices();
    if (message.action === 'lose-camera') { const track = captured.find(t => t.kind === 'video' && t.readyState === 'live'); track?.stop(); track?.dispatchEvent(new Event('ended')); }
    if (message.action === 'freeze-video') for (const track of captured) if (track.kind === 'video' && track.readyState === 'live') freezeVideo.get(track)?.();
    if (message.action === 'delay-start') { mustStayMuted=false; delayNext = true; void call.start('call'); }
    if (message.action === 'release-capture') { releasePending?.(); releasePending = null; }
    if (message.action === 'reset-reference') firstPeer = null;
    if (message.action === 'disable-auto-accept') autoAccept=false;
    if (message.action === 'fail-video-start') {failVideo=true;mustStayMuted=false;void call.start('call');}
    if (message.action === 'audio-only-start') {mustStayMuted=false;void call.start('call',true);}
    if (message.action === 'fail-audio-start') {failAudio=true;mustStayMuted=false;void call.start('call',true);}
    if (message.action === 'delay-next-capture') delayNext=true;
    if (message.action === 'report') { firstPeer ??= call.connection; window.harness.result({ type: 'report', state: call.state, liveTracks: captured.filter(t => t.readyState === 'live').length, videoHeight: remote.videoHeight, peerState: call.connection?.connectionState, samePeer: firstPeer === call.connection, transceivers: call.connection?.getTransceivers().length, unsafeAudioReplacement }); }
    return;
  }
  if (message.type === 'state') {
    latest = { role: message.role, endpoint: null, network: { state: 'online', message: '' }, peerOnline: message.peerOnline, call: message.call, error: null };
    call.handleState(latest);
    if (autoAccept && message.call?.phase === 'ringing' && message.call.caller !== message.role && !call.state.capturing) { mustStayMuted=false; void call.start('accept'); }
  } else if (message.type === 'ended') call.stop(message.reason);
  else if (message.type === 'description' || message.type === 'ice') void call.handleSignal(message);
});
window.harness.result({ type: 'ready' });
