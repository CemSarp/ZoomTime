import { microphoneConstraints, speakerEchoStatus } from '../src/audio-processing.ts';
import { DeviceCheck } from '../src/device-check.ts';
import { MediaCall } from '../src/media-call.ts';
import { GroupVideoView } from '../src/call-view.ts';
import type { CallingState, CaptureAction } from '../src/calling-state.ts';
import type { ClientMessage, ServerMessage } from '../src/protocol.ts';
declare global {
  interface Window { harness: { send(message: ClientMessage): Promise<void>; authorize(action: CaptureAction | 'check' | 'permission-probe'): Promise<void>; release(): Promise<void>; event(callback: (message: ServerMessage | { type: 'action'; action: string; targetIds?: string[]; participantId?: string; volume?: number }) => void): void; result(value: unknown): void } }
}
const systemCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
async function probePermissions(): Promise<void> {
  let denied = false;
  try { const stream = await systemCapture({audio:true,video:true}); stream.getTracks().forEach(t=>t.stop()); }
  catch (error) { denied = (error as Error).name === 'NotAllowedError'; }
  await window.harness.authorize('permission-probe');
  try {
    const stream = await systemCapture({audio:true,video:true}); const kinds = stream.getTracks().map(t=>t.kind).sort(); stream.getTracks().forEach(t=>t.stop());
    window.harness.result({type:'permission-probe',denied,kinds});
  } catch (error) { window.harness.result({type:'permission-probe',denied,error:(error as Error).name}); }
  finally { await window.harness.release(); }
}
async function probeSpeakerEcho(): Promise<void> {
  let stream: MediaStream | null = null;
  await window.harness.authorize('check');
  try {
    stream = await systemCapture({ audio: microphoneConstraints(true), video: false });
    const track = stream.getAudioTracks()[0];
    const capabilities = track.getCapabilities().echoCancellation ?? [];
    const status = speakerEchoStatus(track, true);
    const setting = track.getSettings().echoCancellation, transitions = [];
    for (const echoCancellation of [{ ideal: 'all' }, true, { ideal: 'remote-only' }, { ideal: 'all' }, { ideal: 'remote-only' }]) {
      await track.applyConstraints({ echoCancellation }); transitions.push({ requested: echoCancellation, setting: track.getSettings().echoCancellation });
    }
    const replacements = [];
    for (const mode of ['remote-only', 'all']) {
      const replacement = await systemCapture({ audio: { ...microphoneConstraints(false), echoCancellation: { exact: mode } }, video: false });
      replacements.push({ requested: mode, setting: replacement.getAudioTracks()[0].getSettings().echoCancellation }); replacement.getTracks().forEach(t => t.stop());
    }
    window.harness.result({ type: 'echo-probe', status, capabilities, setting, transitions, replacements, live: track.readyState === 'live' });
  } finally { stream?.getTracks().forEach(t => t.stop()); await window.harness.release(); }
}
const captured: MediaStreamTrack[] = [];
let acquisitions = 0;
const identities = new WeakMap<object, string>();
const identity = (peer: object) => { if (!identities.has(peer)) identities.set(peer, crypto.randomUUID()); return identities.get(peer)!; };
const paused = new Map<string, { sender: RTCRtpSender; track: MediaStreamTrack }>();
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
  acquisitions++;
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
const local = document.querySelector<HTMLVideoElement>('#local')!; local.muted = true;
const videos = new GroupVideoView(document.querySelector('#remote-grid')!, document.querySelector('#focus-person')!, () => {});
const remoteHeight = () => Math.max(0, ...[...call.connections.keys()].map(id => videos.remote(id).videoHeight));
const call = new MediaCall({ authorizeCapture: action => window.harness.authorize(action), releaseCapture: () => window.harness.release(), sendSignal: m => window.harness.send(m) },
  { local, remote: id => videos.remote(id), removeRemote: id => videos.remove(id), changed: state => { if (latest) videos.render(latest.members, latest.call, state); window.harness.result({ type: 'media', state, liveTracks: captured.filter(t => t.readyState === 'live').length, videoHeight: remoteHeight() }); } });
const monitorGains: GainNode[] = [];
const makeGain = AudioContext.prototype.createGain;
AudioContext.prototype.createGain = function() { const gain = makeGain.call(this); monitorGains.push(gain); return gain; };
const checkVideo = document.createElement('video'); checkVideo.muted = true; document.body.append(checkVideo);
const deviceCheck = new DeviceCheck({ authorizeDeviceCheck: () => window.harness.authorize('check'), releaseDeviceCheck: () => window.harness.release() }, checkVideo,
  state => window.harness.result({ type: 'check', state, monitorGain: monitorGains.at(-1)?.gain.value, liveTracks: captured.filter(t => t.readyState === 'live').length, videoHeight: checkVideo.videoHeight }));
let latest: CallingState;
const start = (audioOnly = false, targetIds?: string[]) => call.start({ action: 'call', targetIds: targetIds ?? latest.members.filter(m => m.id !== latest.selfId && m.online).map(m => m.id) }, audioOnly);

window.harness.event(message => {
  if (message.type === 'action') {
    if (message.action === 'probe-echo') void probeSpeakerEcho();
    if (message.action === 'echo-on') void call.setSpeakerEchoReduction(true);
    if (message.action === 'echo-live-on' || message.action === 'echo-live-off') {
      const enabled = message.action === 'echo-live-on'; void call.setSpeakerEchoReduction(enabled).then(() => window.harness.result({ type: 'echo-change', enabled, state: call.state }));
    }
    if (message.action === 'check-start-experimental') void deviceCheck.start('720p', true);
    if (message.action === 'check-start') void deviceCheck.start('720p');
    if (message.action === 'check-stop') void deviceCheck.stop();
    if (message.action === 'check-listen-race') {
      const context = monitorGains.at(-1)!.context as AudioContext, resume = context.resume.bind(context);
      let release!: () => void; context.resume = () => new Promise<void>(resolve => { release = resolve; });
      void (async () => { const listening = deviceCheck.listen(true); await deviceCheck.listen(false); release(); await listening; context.resume = resume; window.harness.result({ type: 'check-race', state: deviceCheck.state, monitorGain: monitorGains.at(-1)!.gain.value }); })();
    }
    if (message.action === 'check-listen') void deviceCheck.listen(true);
    if (message.action === 'check-silence') void deviceCheck.listen(false);
    if (message.action === 'check-delay') { delayNext = true; void deviceCheck.start('720p'); }
    if (message.action === 'check-fail') { failVideo = true; void deviceCheck.start('720p'); }
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
    if (message.action === 'start') { mustStayMuted=false; void start(false, message.targetIds); }
    if (message.action === 'camera') void call.toggleCamera();
    if (message.action === 'mute') { call.toggleMute(); mustStayMuted=call.state.muted; }
    if (message.action === 'hangup') call.hangup();
    if (message.action === 'recover-devices') void call.retryDevices();
    if (message.action === 'lose-camera') { const track = captured.find(t => t.kind === 'video' && t.readyState === 'live'); track?.stop(); track?.dispatchEvent(new Event('ended')); }
    if (message.action === 'freeze-video') for (const track of captured) if (track.kind === 'video' && track.readyState === 'live') freezeVideo.get(track)?.();
    if (message.action === 'delay-start') { mustStayMuted=false; delayNext = true; void start(false, message.targetIds); }
    if (message.action === 'release-capture') { releasePending?.(); releasePending = null; }
    if (message.action === 'reset-reference') firstPeer = null;
    if (message.action === 'disable-auto-accept') autoAccept=false;
    if (message.action === 'enable-auto-accept') autoAccept=true;
    if (message.action === 'output-volume' && message.volume !== undefined) videos.setOutputVolume(message.volume);
    if (message.action === 'participant-volume' && message.participantId && message.volume !== undefined) videos.setParticipantVolume(message.participantId, message.volume);
    if (message.action === 'pin') videos.pin(message.participantId ?? null);
    if (message.action === 'invite' && latest.call && message.targetIds) void window.harness.send({v:2,type:'invite',callId:latest.call.id,targetIds:message.targetIds});
    if (message.action === 'pause-peer-video' && message.participantId) { const sender=call.connections.get(message.participantId)?.getSenders().find(s=>s.track?.kind==='video'); if(sender?.track){paused.set(message.participantId,{sender,track:sender.track});void sender.replaceTrack(null);} }
    if (message.action === 'resume-peer-video' && message.participantId) { const saved=paused.get(message.participantId);if(saved){void saved.sender.replaceTrack(saved.track);paused.delete(message.participantId);} }
    if (message.action === 'fail-video-start') {failVideo=true;mustStayMuted=false;void start(false, message.targetIds);}
    if (message.action === 'audio-only-start') {mustStayMuted=false;void start(true, message.targetIds);}
    if (message.action === 'fail-audio-start') {failAudio=true;mustStayMuted=false;void start(true, message.targetIds);}
    if (message.action === 'delay-next-capture') delayNext=true;
    if (message.action === 'report') { firstPeer ??= call.connection; window.harness.result({ type: 'report', state: call.state, liveTracks: captured.filter(t => t.readyState === 'live').length, videoHeight: remoteHeight(), peerState: call.connection?.connectionState, samePeer: firstPeer === call.connection, transceivers: call.connection?.getTransceivers().length, unsafeAudioReplacement, acquisitions, localTrackIds: (local.srcObject instanceof MediaStream ? local.srcObject.getTracks().map(t=>t.id) : []), cameraTrackIds: (local.srcObject instanceof MediaStream ? local.srcObject.getVideoTracks().map(t=>t.id) : []), audioEnabled: (local.srcObject instanceof MediaStream ? local.srcObject.getAudioTracks().map(t=>t.enabled) : []), videoCount: document.querySelectorAll('#remote-grid video').length, peers: [...call.connections].map(([id,peer])=>({id,identity:identity(peer),connection:peer.connectionState,transceivers:peer.getTransceivers().length,videoHeight:videos.remote(id).videoHeight,hidden:getComputedStyle(videos.remote(id).parentElement!).opacity==='0',stats:call.state.peers[id]?.stats,muted:videos.remote(id).muted,volume:videos.remote(id).volume,videoIdentity:identity(videos.remote(id))})) }); }
    return;
  }
  if (message.type === 'state') {
    latest = { role: message.selfId === message.hostId ? 'host' : 'guest', endpoint: null, selfId:message.selfId,hostId:message.hostId,groupId:message.groupId,members:message.members,busy:message.busy,network:{state:'online',message:''},call:message.call,error:null };
    call.handleState(latest);
    const own=message.call?.members.find(m=>m.id===message.selfId);
    if (autoAccept && own?.status==='invited' && own.invitationId && !call.state.capturing) { mustStayMuted=false; void call.start({action:'accept',callId:message.call!.id,invitationId:own.invitationId}); }
  } else if (message.type === 'ended') call.stop(message.reason);
  else if (message.type === 'description' || message.type === 'ice') void call.handleSignal(message);
});
window.harness.result({ type: 'ready' });
