import { microphoneConstraints, requestMicrophone, speakerEchoStatus, type SpeakerEchoStatus } from './audio-processing.ts';
import { videoConstraints, type VideoQuality } from './preferences.ts';
import type { CallingState, CaptureAction, StartCall } from './calling-state.ts';
import type { ClientMessage, ServerMessage } from './protocol.ts';
import { MediaPeer, type MediaPeerState } from './media-peer.ts';
export interface MediaState { capturing: boolean; speakerEcho: SpeakerEchoStatus; muted: boolean; cameraOn: boolean; error: string | null; audioOnlyOffered: boolean; connection: string; stale: boolean; stats: Record<string, string | number>; peers: Record<string, MediaPeerState> }
export interface MediaBridge { authorizeCapture(action: CaptureAction): Promise<void>; releaseCapture(): Promise<void>; sendSignal(message: ClientMessage): Promise<void> }
export interface MediaView { local: HTMLVideoElement; remote(id: string): HTMLVideoElement; removeRemote(id: string): void; changed(state: MediaState): void }
const initial = (): MediaState => ({ capturing: false, speakerEcho: 'standard', muted: false, cameraOn: false, error: null, audioOnlyOffered: false, connection: 'idle', stale: false, stats: {}, peers: {} });
export class MediaCall {
  private bridge: MediaBridge;
  private view: MediaView;
  private latest: CallingState | null = null;
  private stream: MediaStream | null = null;
  private retiringStream: MediaStream | null = null;
  private peers = new Map<string, MediaPeer>();
  private wantedCamera = false;
  private speakerEchoReduction = false;
  private quality: VideoQuality = '720p';
  private qualityBusy = false;
  private epoch = 0;
  private operationId: string | null = null;
  private captureTimer: ReturnType<typeof setTimeout> | undefined;
  private requestTimer: ReturnType<typeof setTimeout> | undefined;
  private value = initial();
  constructor(bridge: MediaBridge, view: MediaView) { this.bridge = bridge; this.view = view; navigator.mediaDevices.addEventListener('devicechange', () => this.checkDevices()); }
  async setSpeakerEchoReduction(enabled: boolean): Promise<void> {
    if (enabled === this.speakerEchoReduction) return;
    if (!this.stream) { this.speakerEchoReduction = enabled; return; }
    const callId = this.latest?.call?.id;
    if (this.value.capturing || !callId) throw new Error('Wait for the microphone operation to finish, then retry speaker echo reduction.');
    const epoch = this.epoch, previousSetting = this.speakerEchoReduction;
    this.speakerEchoReduction = enabled; this.value.capturing = true; this.changed();
    let acquired: MediaStream | null = null, previous: MediaStream | null = null, replacement: MediaStreamTrack | null = null;
    let rollbackFailed = false;
    try {
      await this.bridge.authorizeCapture({ action: 'devices', callId }); if (!this.valid(epoch)) return;
      acquired = await requestMicrophone(enabled, this.stream.getAudioTracks()[0]); if (!this.valid(epoch)) return;
      const microphone = acquired.getAudioTracks()[0]; microphone.enabled = !this.value.muted;
      replacement = microphone;
      previous = new MediaStream(this.stream.getAudioTracks()); this.retiringStream = previous;
      for (const track of previous.getTracks()) this.stream.removeTrack(track);
      this.stream.addTrack(microphone); acquired = null;
      const replaced = await Promise.allSettled([...this.peers.values()].map(peer => peer.replaceMicrophone(microphone))); if (!this.valid(epoch)) return;
      if (replaced.some(result => result.status === 'rejected')) {
        const original = previous.getAudioTracks()[0]; original.enabled = !this.value.muted; this.stream.removeTrack(microphone); this.stream.addTrack(original);
        this.retiringStream = new MediaStream([microphone]); previous = this.retiringStream;
        const restored = await Promise.allSettled([...this.peers.values()].map(peer => peer.replaceMicrophone(original))); if (!this.valid(epoch)) return;
        rollbackFailed = restored.some(result => result.status === 'rejected');
        if (rollbackFailed) this.value.error = 'Some microphone senders could not recover. Use Recover devices; your call remains open.';
        throw new Error('Speaker echo sender replacement failed.');
      }
      this.value.speakerEcho = speakerEchoStatus(microphone, enabled); this.attachPreview(); this.mediaStatus();
    } catch {
      if (this.valid(epoch)) { this.speakerEchoReduction = previousSetting; throw new Error(rollbackFailed ? this.value.error! : 'Speaker echo reduction could not change. Your current microphone and call are kept. Retry when ready.'); }
    } finally {
      acquired?.getTracks().forEach(track => track.stop()); previous?.getTracks().forEach(track => track.stop());
      if (replacement && !this.stream?.getAudioTracks().includes(replacement)) replacement.stop();
      if (this.retiringStream === previous) this.retiringStream = null;
      if (this.valid(epoch)) { this.value.capturing = false; this.changed(); }
    }
  }
  get connections(): ReadonlyMap<string, RTCPeerConnection> { return new Map([...this.peers].map(([id, peer]) => [id, peer.connection])); }
  get connection(): RTCPeerConnection | null { return this.peers.values().next().value?.connection ?? null; }
  get state(): MediaState {
    const peers = Object.fromEntries([...this.peers].map(([id, peer]) => [id, peer.state]));
    return { ...this.value, stats: { ...this.value.stats }, peers };
  }
  private changed(): void {
    const states = [...this.peers.values()].map(peer => peer.state);
    if (states.length) {
      const connected = states.filter(p => p.connection === 'connected' && !p.stale).length;
      this.value.connection = connected === states.length ? 'connected' : connected ? 'degraded' : states.every(p => p.connection === 'failed') ? 'failed' : 'connecting';
      this.value.stale = states.some(p => p.stale);
    }
    const capture = this.stream?.getVideoTracks()[0]?.getSettings();
    this.value.stats = { captureWidth: capture?.width ?? 0, captureHeight: capture?.height ?? 0, captureFps: Math.round(capture?.frameRate ?? 0), peers: states.length,
      receivedVideoFrames: states.reduce((sum, p) => sum + Number(p.stats.receivedVideoFrames ?? 0), 0), receivedAudioPackets: states.reduce((sum, p) => sum + Number(p.stats.receivedAudioPackets ?? 0), 0),
      sendKbps: states.reduce((sum, p) => sum + Number(p.stats.sendKbps ?? 0), 0), receiveKbps: states.reduce((sum, p) => sum + Number(p.stats.receiveKbps ?? 0), 0) };
    this.view.changed(this.state);
  }
  private valid(epoch: number): boolean { return epoch === this.epoch; }
  private mediaStatus(): void {
    const call = this.latest?.call, own = call?.members.find(m => m.id === this.latest?.selfId);
    if (call && this.stream && own?.status === 'joined') void this.bridge.sendSignal({ v: 2, type: 'media', callId: call.id,
      audio: !this.value.muted && this.stream.getAudioTracks().some(t => t.readyState === 'live'), video: this.value.cameraOn }).catch(() => {});
  }
  handleState(state: CallingState): void {
    const previous = this.latest?.call; this.latest = state;
    if (previous && previous.id !== state.call?.id) this.stop('Call ended');
    const call = state.call, own = call?.members.find(m => m.id === state.selfId);
    if (!call || !this.stream || own?.status !== 'joined') { this.changed(); return; }
    if (own.operationId === this.operationId) { clearTimeout(this.requestTimer); this.requestTimer = undefined; }
    const audio = !this.value.muted && this.stream.getAudioTracks().some(t => t.readyState === 'live');
    if (own.media.audio !== audio || own.media.video !== this.value.cameraOn) this.mediaStatus();
    const active = call.pairs.filter(p => p.a === state.selfId || p.b === state.selfId);
    for (const [id, peer] of this.peers) if (!active.some(p => p.id === peer.pairId)) { peer.close(); this.peers.delete(id); this.view.removeRemote(id); }
    for (const snapshot of active) {
      const remoteId = snapshot.a === state.selfId ? snapshot.b : snapshot.a;
      let peer = this.peers.get(remoteId);
      if (!peer) {
        peer = new MediaPeer({ selfId: state.selfId!, callId: call.id, snapshot, stream: this.stream, remote: this.view.remote(remoteId), send: m => this.bridge.sendSignal(m), changed: () => this.changed() });
        this.peers.set(remoteId, peer);
      }
      peer.apply(snapshot, call.members.find(m => m.id === remoteId)!.media);
    }
    if (!active.length) this.value.connection = 'ringing'; this.changed();
  }
  private constraints(camera: boolean, speakerEchoReduction = this.speakerEchoReduction): MediaStreamConstraints { return { audio: microphoneConstraints(speakerEchoReduction), video: camera ? videoConstraints(this.quality) : false }; }
  async setQuality(quality: VideoQuality): Promise<void> {
    if (quality !== '360p' && quality !== '720p' && quality !== '1080p') throw new Error('Unsupported camera quality.');
    if (quality === this.quality) return;
    if (this.qualityBusy || this.value.capturing) throw new Error('Wait for the camera operation to finish, then retry quality.');
    const track = this.stream?.getVideoTracks().find(t => t.readyState === 'live'), epoch = this.epoch;
    if (!track) { this.quality = quality; return; }
    this.qualityBusy = true;
    try { await track.applyConstraints(videoConstraints(quality)); if (this.valid(epoch)) { this.quality = quality; this.changed(); } }
    catch { if (this.valid(epoch)) throw new Error('Camera quality could not change. Your previous setting is kept. Try a lower resolution.'); }
    finally { this.qualityBusy = false; }
  }
  private boundCapture(epoch: number): void {
    this.captureTimer = setTimeout(() => { if (this.valid(epoch)) this.hangup('Device permission request timed out. Retry explicitly.'); }, 60_000);
  }
  async start(request: StartCall, audioOnly = false): Promise<void> {
    if (this.value.capturing || this.stream) return;
    const epoch = ++this.epoch, speakerEchoReduction = this.speakerEchoReduction, operationId = crypto.randomUUID();
    let stage: 'authorize' | 'capture' | 'signal' = 'authorize';
    this.operationId = operationId; this.value = { ...initial(), capturing: true, connection: 'requesting devices' }; this.changed();
    this.boundCapture(epoch);
    try {
      await this.bridge.authorizeCapture({ ...request, operationId }); if (!this.valid(epoch)) return;
      stage = 'capture';
      const stream = await navigator.mediaDevices.getUserMedia(this.constraints(!audioOnly, speakerEchoReduction));
      if (!this.valid(epoch)) { stream.getTracks().forEach(t => t.stop()); return; }
      if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); throw new Error('No microphone'); }
      this.stream = stream; this.value.speakerEcho = speakerEchoStatus(stream.getAudioTracks()[0], speakerEchoReduction);
      this.value.cameraOn = stream.getVideoTracks().length > 0; this.wantedCamera = this.value.cameraOn; this.attachPreview();
      this.value.capturing = false; this.value.connection = 'ringing'; stage = 'signal';
      this.requestTimer = setTimeout(() => { if (this.valid(epoch)) this.hangup('Call setup was not acknowledged within 30 seconds. Check the host and Tailscale.'); }, 30_000);
      if (request.action === 'accept') await this.bridge.sendSignal({ v: 2, type: 'accept', callId: request.callId, invitationId: request.invitationId, operationId });
      else await this.bridge.sendSignal({ v: 2, type: 'request', operationId, targetIds: request.targetIds });
      if (this.valid(epoch)) { this.mediaStatus(); this.changed(); }
    } catch (error) {
      if (!this.valid(epoch)) return;
      clearTimeout(this.requestTimer); this.requestTimer = undefined; this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.view.local.srcObject = null;
      this.value.capturing = false; this.value.cameraOn = false; this.value.connection = 'error'; this.value.audioOnlyOffered = stage === 'capture' && !audioOnly;
      this.value.error = stage !== 'capture' ? 'Call setup is no longer available. Check the host and retry.' : audioOnly ? 'Microphone unavailable or permission denied. Check macOS Privacy & Security and retry.' :
        (error as Error).name === 'NotReadableError' ? 'The camera or microphone is busy. Close the other app, retry, or explicitly continue with microphone only.' : 'Camera/microphone access failed. Check macOS Privacy & Security, retry, or explicitly try microphone only.';
      void this.bridge.releaseCapture(); this.changed();
    } finally { if (this.valid(epoch)) { clearTimeout(this.captureTimer); this.captureTimer = undefined; } }
  }
  private attachPreview(): void {
    this.view.local.muted = true; this.view.local.srcObject = this.stream; void this.view.local.play().catch(() => {});
    for (const track of this.stream?.getTracks() ?? []) track.onended = () => this.checkDevices();
  }
  private checkDevices(): void {
    if (this.stream?.getTracks().some(t => t.readyState === 'ended')) {
      this.value.cameraOn = this.stream.getVideoTracks().some(t => t.readyState === 'live'); this.mediaStatus(); this.value.error = 'A camera or microphone disconnected. Use Recover devices to acquire the current macOS defaults.'; this.changed();
    }
  }
  async handleSignal(message: ServerMessage): Promise<void> { if (message.type === 'description' || message.type === 'ice') await [...this.peers.values()].find(p => p.pairId === message.pairId)?.handleSignal(message); }
  toggleMute(): void {
    if (!this.stream) return; this.value.muted = !this.value.muted;
    for (const track of this.stream.getAudioTracks()) track.enabled = !this.value.muted; this.mediaStatus(); this.changed();
  }
  private async replaceAll(stream: MediaStream): Promise<void> { await Promise.allSettled([...this.peers.values()].map(peer => peer.replaceTracks(stream))); }
  async toggleCamera(): Promise<void> {
    if (!this.stream || this.value.capturing) return;
    const epoch = this.epoch, callId = this.latest?.call?.id; if (!callId) return;
    if (this.value.cameraOn) {
      this.value.capturing = true; this.value.cameraOn = false; this.wantedCamera = false;
      for (const track of this.stream.getVideoTracks()) { this.stream.removeTrack(track); track.stop(); }
      await this.replaceAll(this.stream); if (this.valid(epoch)) { this.value.capturing = false; this.mediaStatus(); this.changed(); } return;
    }
    this.value.capturing = true; this.boundCapture(epoch); this.changed(); let acquired: MediaStream | null = null;
    try {
      await this.bridge.authorizeCapture({ action: 'camera', callId }); if (!this.valid(epoch)) return;
      acquired = await navigator.mediaDevices.getUserMedia({ video: this.constraints(true).video, audio: false }); if (!this.valid(epoch)) return;
      const track = acquired.getVideoTracks()[0]; if (!track) throw new Error('No camera');
      this.stream.addTrack(track); await this.replaceAll(this.stream); if (!this.valid(epoch)) return;
      this.value.cameraOn = true; this.wantedCamera = true; this.value.error = null; acquired = null; this.attachPreview(); this.mediaStatus();
    } catch { if (this.valid(epoch)) this.value.error = 'Camera unavailable. Check permission or close the other camera app, then retry Camera.'; }
    finally { acquired?.getTracks().forEach(t => t.stop()); if (this.valid(epoch)) { clearTimeout(this.captureTimer); this.captureTimer = undefined; this.value.capturing = false; this.changed(); } }
  }
  async retryDevices(): Promise<void> {
    if (!this.stream || this.value.capturing) return;
    const epoch = this.epoch, callId = this.latest?.call?.id, speakerEchoReduction = this.speakerEchoReduction; if (!callId) return;
    this.value.capturing = true; this.boundCapture(epoch); this.changed(); let acquired: MediaStream | null = null, previous: MediaStream | null = null;
    try {
      await this.bridge.authorizeCapture({ action: 'devices', callId }); if (!this.valid(epoch)) return;
      acquired = await navigator.mediaDevices.getUserMedia(this.constraints(this.wantedCamera, speakerEchoReduction)); if (!this.valid(epoch)) return;
      const mic = acquired.getAudioTracks()[0]; if (!mic) throw new Error('No microphone');
      // Mute before any sender can observe the replacement microphone.
      for (const track of acquired.getAudioTracks()) track.enabled = !this.value.muted;
      // New peers joining while replacements await must observe the new shared stream.
      previous = this.stream; this.retiringStream = previous; this.stream = acquired; acquired = null;
      await this.replaceAll(this.stream); if (!this.valid(epoch)) return;
      this.value.speakerEcho = speakerEchoStatus(mic, speakerEchoReduction); this.value.cameraOn = this.stream.getVideoTracks().length > 0; this.value.error = null; this.attachPreview(); this.mediaStatus();
    } catch { if (this.valid(epoch)) this.value.error = 'Default devices could not be recovered. Check macOS settings and retry, or leave this call.'; }
    finally { acquired?.getTracks().forEach(t => t.stop()); previous?.getTracks().forEach(t => t.stop()); if (this.retiringStream === previous) this.retiringStream = null; if (this.valid(epoch)) { clearTimeout(this.captureTimer); this.captureTimer = undefined; this.value.capturing = false; this.changed(); } }
  }
  async resumeAudio(): Promise<void> { await Promise.all([...this.peers.values()].map(peer => peer.resumeAudio())); }
  hangup(reason = 'Call ended'): void {
    const call = this.latest?.call, own = call?.members.find(m => m.id === this.latest?.selfId);
    if (call && own?.status === 'invited' && own.invitationId) void this.bridge.sendSignal({ v: 2, type: 'reject', callId: call.id, invitationId: own.invitationId }).catch(() => {});
    else if (call && own?.status === 'joined') void this.bridge.sendSignal({ v: 2, type: call.pairs.length === 0 && call.callerId === own.id ? 'cancel' : 'hangup', callId: call.id }).catch(() => {});
    this.stop(reason);
  }
  stop(reason = ''): void {
    this.epoch++; clearTimeout(this.captureTimer); clearTimeout(this.requestTimer); this.captureTimer = undefined; this.requestTimer = undefined;
    for (const [id, peer] of this.peers) { peer.close(); this.view.removeRemote(id); } this.peers.clear();
    this.retiringStream?.getTracks().forEach(t => t.stop()); this.retiringStream = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.wantedCamera = false; this.operationId = null; this.view.local.srcObject = null;
    this.value = { ...initial(), error: reason || null, connection: 'ended' }; void this.bridge.releaseCapture(); this.changed();
  }
}
