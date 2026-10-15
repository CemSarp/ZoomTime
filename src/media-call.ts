import { videoConstraints, type VideoQuality } from './preferences.ts';
import type { CallingState, CaptureAction } from './calling-service.ts';
import type { ClientMessage, ServerMessage } from './protocol.ts';
export interface MediaState { capturing: boolean; muted: boolean; cameraOn: boolean; error: string | null; audioOnlyOffered: boolean; connection: string; stale: boolean; stats: Record<string, string | number> }
export interface MediaBridge { authorizeCapture(action: CaptureAction): Promise<void>; releaseCapture(): Promise<void>; sendSignal(message: ClientMessage): Promise<void> }
export interface MediaView { local: HTMLVideoElement; remote: HTMLVideoElement; changed(state: MediaState): void }
export class MediaCall {
  private bridge: MediaBridge;
  private view: MediaView;
  private latest: CallingState | null = null;
  private stream: MediaStream | null = null;
  private wantedCamera = false;
  private quality: VideoQuality = '720p';
  private qualityBusy = false;
  private peer: RTCPeerConnection | null = null;
  private epoch = 0;
  private offered = 0;
  private remoteGeneration = 0;
  private queue = Promise.resolve();
  private earlyIce: { generation: number; candidate: RTCIceCandidateInit | null }[] = [];
  private localIce: RTCIceCandidateInit[] = [];
  private localGeneration = 0;
  private localUfrags = new Map<string, number>();
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private captureTimer: ReturnType<typeof setTimeout> | undefined;
  private requestTimer: ReturnType<typeof setTimeout> | undefined;
  private outageTimer: ReturnType<typeof setTimeout> | undefined;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private recoveryRequested = false;
  private lastStats = { at: 0, sent: 0, received: 0, frames: 0, frameAt: 0 };
  private value: MediaState = { capturing: false, muted: false, cameraOn: false, error: null, audioOnlyOffered: false, connection: 'idle', stale: false, stats: {} };
  constructor(bridge: MediaBridge, view: MediaView) {
    this.bridge = bridge; this.view = view;
    navigator.mediaDevices.addEventListener('devicechange', () => this.checkDevices());
  }
  get connection(): RTCPeerConnection | null { return this.peer; }
  get state(): MediaState { return { ...this.value, stats: { ...this.value.stats } }; }
  private changed(): void { this.view.changed(this.state); }
  private valid(epoch: number, generation?: number): boolean { return epoch === this.epoch && (generation === undefined || generation === this.latest?.call?.generation); }
  private async send(message: ClientMessage): Promise<void> { await this.bridge.sendSignal(message); }
  private mediaStatus(): void {
    const call = this.latest?.call;
    if (call && this.stream) void this.send({ v: 1, type: 'media', callId: call.id,
      audio: !this.value.muted && this.stream.getAudioTracks().some(t => t.readyState === 'live'), video: this.value.cameraOn }).catch(() => {});
  }
  handleState(state: CallingState): void {
    const previous = this.latest?.call;
    this.latest = state;
    if (previous && previous.id !== state.call?.id) this.stop('Call ended');
    const call = state.call;
    if (call) { clearTimeout(this.requestTimer); this.requestTimer = undefined; }
    if (!call || !this.stream) { this.changed(); return; }
    const own = state.role ? call.media[state.role] : null;
    const audioOn = !this.value.muted && this.stream.getAudioTracks().some(t => t.readyState === 'live');
    if (own && (own.audio !== audioOn || own.video !== this.value.cameraOn)) this.mediaStatus();
    if (call.phase !== 'ringing') {
      if (!this.peer && !this.initialTimer) this.initialTimer = setTimeout(() => this.fail('Media did not connect within 30 seconds. This direct-only build has no STUN/TURN fallback.'), 30_000);
      if (state.role === 'host' && this.offered < call.generation) {
        this.offered = call.generation;
        void this.serial(() => this.offer(call.generation));
      }
      if (state.network.state === 'online' && call.phase === 'reconnecting' && this.peer?.connectionState === 'connected' && this.remoteGeneration === call.generation && this.localGeneration === call.generation) {
        void this.send({ v: 1, type: 'connected', callId: call.id, generation: call.generation }).catch(() => {});
      }
    }
    this.changed();
  }
  private constraints(camera: boolean): MediaStreamConstraints {
    return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: camera ? videoConstraints(this.quality) : false };
  }
  async setQuality(quality: VideoQuality): Promise<void> {
    if (quality !== '360p' && quality !== '720p' && quality !== '1080p') throw new Error('Unsupported camera quality.');
    if (quality === this.quality) return;
    if (this.qualityBusy || this.value.capturing) throw new Error('Wait for the camera operation to finish, then retry quality.');
    const track = this.stream?.getVideoTracks().find(t => t.readyState === 'live'), epoch = this.epoch;
    if (!track) { this.quality = quality; return; }
    this.qualityBusy = true;
    try {
      await track.applyConstraints(videoConstraints(quality));
      if (this.valid(epoch)) { this.quality = quality; this.changed(); }
    } catch {
      if (this.valid(epoch)) throw new Error('Camera quality could not change. Your previous setting is kept. Try a lower resolution.');
    } finally { this.qualityBusy = false; }
  }
  async start(action: 'call' | 'accept', audioOnly = false): Promise<void> {
    if (this.value.capturing || this.stream) return;
    const epoch = ++this.epoch;
    let stage: 'authorize' | 'capture' | 'signal' = 'authorize';
    this.value = { ...this.value, capturing: true, error: null, audioOnlyOffered: false, connection: 'requesting devices' }; this.changed();
    this.captureTimer = setTimeout(() => { if (this.valid(epoch)) this.stop('Device permission request timed out. Retry explicitly.'); }, 60_000);
    try {
      await this.bridge.authorizeCapture(action); if (!this.valid(epoch)) return;
      stage = 'capture';
      const stream = await navigator.mediaDevices.getUserMedia(this.constraints(!audioOnly));
      if (!this.valid(epoch)) { stream.getTracks().forEach(t => t.stop()); return; }
      if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); throw new Error('No microphone'); }
      this.stream = stream; this.value.cameraOn = stream.getVideoTracks().length > 0; this.wantedCamera = this.value.cameraOn; this.value.muted = false;
      this.attachPreview(); this.value.capturing = false; this.value.connection = 'ringing';
      const call = this.latest?.call;
      stage = 'signal';
      if (action === 'accept') {
        if (!call || call.phase !== 'ringing') throw new Error('Call ended');
        await this.send({ v: 1, type: 'accept', callId: call.id });
      } else {
        this.requestTimer = setTimeout(() => { if (this.valid(epoch)) this.fail('Call setup was not acknowledged within 30 seconds. Check the host and Tailscale, then retry.'); }, 30_000);
        await this.send({ v: 1, type: 'request' });
      }
      this.mediaStatus(); this.changed();
    } catch (error) {
      if (!this.valid(epoch)) return;
      clearTimeout(this.requestTimer); this.requestTimer = undefined;
      this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.view.local.srcObject = null;
      this.value.capturing = false; this.value.cameraOn = false; this.value.connection = 'error';
      this.value.audioOnlyOffered = stage === 'capture' && !audioOnly;
      this.value.error = stage !== 'capture' ? 'Call setup is no longer available. Check the private host/Tailscale connection, then retry the call.' : audioOnly ? 'Microphone unavailable or permission denied. Check macOS Privacy & Security and retry.' :
        (error as Error).name === 'NotReadableError' ? 'The camera or microphone is busy. Close the other app, retry, or explicitly continue with microphone only.' :
          'Camera/microphone access failed. Check macOS Privacy & Security, retry, or explicitly try microphone only.';
      void this.bridge.releaseCapture(); this.changed();
    } finally { if (this.valid(epoch)) { clearTimeout(this.captureTimer); this.captureTimer = undefined; } }
  }
  private attachPreview(): void {
    this.view.local.muted = true; this.view.local.srcObject = this.stream;
    void this.view.local.play().catch(() => {});
    for (const track of this.stream?.getTracks() ?? []) track.onended = () => this.checkDevices();
  }
  private checkDevices(): void {
    if (this.stream?.getTracks().some(t => t.readyState === 'ended')) {
      this.value.cameraOn = this.stream.getVideoTracks().some(t => t.readyState === 'live'); this.mediaStatus();
      this.value.error = 'A camera or microphone disconnected. Use Recover devices to acquire the current macOS defaults.'; this.changed();
    }
  }
  private serial(operation: () => Promise<void>): Promise<void> {
    const epoch = this.epoch;
    this.queue = this.queue.then(async () => { if (this.valid(epoch)) await operation(); }).catch(() => {
      if (this.valid(epoch)) this.fail('Media negotiation failed. Check the devices and private network; this build has no STUN/TURN fallback.');
    });
    return this.queue;
  }
  private async ensurePeer(): Promise<RTCPeerConnection> {
    if (this.peer) return this.peer;
    const peer = new RTCPeerConnection({ iceServers: [] }); this.peer = peer;
    const epoch = this.epoch;
    // Only the offerer creates transceivers; the answerer must reuse the offered ones.
    if (this.latest?.role === 'host') for (const kind of ['audio', 'video'] as const) {
      const transceiver = peer.addTransceiver(kind, { direction: 'sendrecv', streams: this.stream ? [this.stream] : [] });
      await transceiver.sender.replaceTrack(this.stream?.getTracks().find(track => track.kind === kind) ?? null);
    }
    peer.ontrack = event => {
      if (!this.valid(epoch) || this.peer !== peer) return;
      const stream = this.view.remote.srcObject instanceof MediaStream ? this.view.remote.srcObject : new MediaStream();
      if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
      if (this.view.remote.srcObject !== stream) this.view.remote.srcObject = stream;
      void this.view.remote.play().catch(() => { if (this.valid(epoch)) { this.value.error = 'Click Resume audio to start partner playback.'; this.changed(); } });
    };
    peer.onicecandidate = event => {
      if (!this.valid(epoch) || this.peer !== peer || !event.candidate) return;
      this.localIce.push(event.candidate.toJSON()); this.flushLocalIce();
    };
    peer.onconnectionstatechange = () => {
      if (!this.valid(epoch) || this.peer !== peer) return;
      this.value.connection = peer.connectionState;
      if (peer.connectionState === 'connected') {
        clearTimeout(this.initialTimer); this.initialTimer = undefined; this.clearOutage();
        const call = this.latest?.call;
        if (call && this.remoteGeneration === call.generation && this.localGeneration === call.generation) void this.send({ v: 1, type: 'connected', callId: call.id, generation: call.generation }).catch(() => {});
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') this.outage();
      this.changed();
    };
    this.lastStats = { at: 0, sent: 0, received: 0, frames: 0, frameAt: Date.now() };
    this.statsTimer = setInterval(() => { void this.statistics(peer, epoch); }, 1000);
    return peer;
  }
  private rememberLocal(peer: RTCPeerConnection, generation: number): void {
    this.localGeneration = generation;
    for (const match of peer.localDescription!.sdp.matchAll(/^a=ice-ufrag:(.+)$/gm)) this.localUfrags.set(match[1].trim(), generation);
    while (this.localUfrags.size > 8) this.localUfrags.delete(this.localUfrags.keys().next().value!);
    this.flushLocalIce();
  }
  private flushLocalIce(): void {
    const call = this.latest?.call; if (!call || !this.localGeneration) return;
    const remaining: RTCIceCandidateInit[] = [];
    for (const candidate of this.localIce) {
      const generation = candidate.usernameFragment ? this.localUfrags.get(candidate.usernameFragment) : this.localGeneration;
      if (!generation) { remaining.push(candidate); continue; }
      if (generation === call.generation) void this.send({ v: 1, type: 'ice', callId: call.id, generation, candidate }).catch(() => {});
    }
    this.localIce = remaining.slice(-100);
  }
  private async offer(generation: number): Promise<void> {
    const epoch = this.epoch, callId = this.latest?.call?.id;
    if (!callId || !this.valid(epoch, generation)) return;
    const peer = await this.ensurePeer(); if (!this.valid(epoch, generation)) return;
    const offer = await peer.createOffer({ iceRestart: generation > 1 }); if (!this.valid(epoch, generation)) return;
    await peer.setLocalDescription(offer); if (!this.valid(epoch, generation)) return;
    await this.send({ v: 1, type: 'description', callId, generation, description: { type: 'offer', sdp: peer.localDescription!.sdp } });
    this.rememberLocal(peer, generation);
  }
  async handleSignal(message: ServerMessage): Promise<void> {
    if (message.type !== 'description' && message.type !== 'ice') return;
    return this.serial(async () => {
      const call = this.latest?.call, epoch = this.epoch;
      if (!call || !this.stream || message.callId !== call.id || message.generation !== call.generation) return;
      if (message.type === 'ice') {
        if (this.remoteGeneration !== message.generation || !this.peer?.remoteDescription) {
          if (this.earlyIce.length >= 100) throw new Error('Too many early candidates');
          this.earlyIce.push({ generation: message.generation, candidate: message.candidate }); return;
        }
        await this.peer.addIceCandidate(message.candidate); return;
      }
      if ((this.latest?.role === 'host' && message.description.type !== 'answer') || (this.latest?.role === 'guest' && message.description.type !== 'offer')) throw new Error('Wrong offerer');
      const peer = await this.ensurePeer(); if (!this.valid(epoch, call.generation)) return;
      await peer.setRemoteDescription(message.description); if (!this.valid(epoch, call.generation)) return;
      this.remoteGeneration = call.generation;
      if (message.description.type === 'offer') for (const transceiver of peer.getTransceivers()) {
        transceiver.direction = 'sendrecv';
        transceiver.sender.setStreams(this.stream!);
        await transceiver.sender.replaceTrack(this.stream!.getTracks().find(track => track.kind === transceiver.receiver.track.kind) ?? null);
        if (!this.valid(epoch, call.generation)) return;
      }
      const candidates = this.earlyIce; this.earlyIce = [];
      for (const item of candidates) if (item.generation === call.generation) { await peer.addIceCandidate(item.candidate); if (!this.valid(epoch, call.generation)) return; }
      if (message.description.type === 'offer') {
        const answer = await peer.createAnswer(); if (!this.valid(epoch, call.generation)) return;
        await peer.setLocalDescription(answer); if (!this.valid(epoch, call.generation)) return;
        await this.send({ v: 1, type: 'description', callId: call.id, generation: call.generation, description: { type: 'answer', sdp: peer.localDescription!.sdp } });
        this.rememberLocal(peer, call.generation);
      }
      if (this.valid(epoch, call.generation) && peer.connectionState === 'connected') {
        await this.send({ v: 1, type: 'connected', callId: call.id, generation: call.generation });
      }
    });
  }
  toggleMute(): void {
    if (!this.stream) return;
    this.value.muted = !this.value.muted;
    for (const track of this.stream.getAudioTracks()) track.enabled = !this.value.muted;
    this.mediaStatus(); this.changed();
  }
  async toggleCamera(): Promise<void> {
    if (!this.stream || this.value.capturing) return;
    const epoch = this.epoch, sender = this.peer?.getSenders().find(s => s.track?.kind === 'video') ?? this.peer?.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
    if (this.value.cameraOn) {
      const tracks = this.stream.getVideoTracks(); this.value.cameraOn = false; this.wantedCamera = false;
      for (const track of tracks) { this.stream.removeTrack(track); track.stop(); }
      try { await sender?.replaceTrack(null); } catch { /* The capture is released even if the peer disappeared. */ }
      if (this.valid(epoch)) { this.mediaStatus(); this.changed(); } return;
    }
    this.value.capturing = true; this.changed();
    let acquired: MediaStream | null = null;
    try {
      await this.bridge.authorizeCapture('camera'); if (!this.valid(epoch)) return;
      acquired = await navigator.mediaDevices.getUserMedia({ video: this.constraints(true).video, audio: false });
      if (!this.valid(epoch)) return;
      const track = acquired.getVideoTracks()[0]; if (!track) throw new Error('No camera');
      await sender?.replaceTrack(track); if (!this.valid(epoch)) return;
      this.stream!.addTrack(track); this.value.cameraOn = true; this.wantedCamera = true; this.value.error = null; acquired = null; this.attachPreview(); this.mediaStatus();
    } catch { if (this.valid(epoch)) this.value.error = 'Camera unavailable. Check permission or close the other camera app, then retry Camera.'; }
    finally { acquired?.getTracks().forEach(t => t.stop()); if (this.valid(epoch)) { this.value.capturing = false; this.changed(); } }
  }
  async retryDevices(): Promise<void> {
    if (!this.stream || this.value.capturing) return;
    const epoch = this.epoch; this.value.capturing = true; this.changed(); let acquired: MediaStream | null = null;
    try {
      await this.bridge.authorizeCapture('devices'); if (!this.valid(epoch)) return;
      acquired = await navigator.mediaDevices.getUserMedia(this.constraints(this.wantedCamera)); if (!this.valid(epoch)) return;
      // Preserve mute before any new microphone track can reach an active sender.
      for (const track of acquired.getAudioTracks()) track.enabled = !this.value.muted;
      for (const kind of ['audio', 'video']) {
        const sender = this.peer?.getTransceivers().find(t => t.receiver.track.kind === kind)?.sender;
        await sender?.replaceTrack(acquired.getTracks().find(t => t.kind === kind) ?? null); if (!this.valid(epoch)) return;
      }
      const old = this.stream; this.stream = acquired; acquired = null; old.getTracks().forEach(t => t.stop());
      for (const track of this.stream.getAudioTracks()) track.enabled = !this.value.muted;
      this.value.cameraOn = this.stream.getVideoTracks().length > 0; this.value.error = null; this.attachPreview(); this.mediaStatus();
    } catch { if (this.valid(epoch)) this.value.error = 'Default devices could not be recovered. Check macOS settings and retry, or end this call.'; }
    finally { acquired?.getTracks().forEach(t => t.stop()); if (this.valid(epoch)) { this.value.capturing = false; this.changed(); } }
  }
  private outage(): void {
    if (!this.latest?.call || this.recoveryTimer) return;
    this.recoveryTimer = setTimeout(() => this.fail('Media recovery exceeded 30 seconds. Check the private network; no STUN/TURN fallback is configured.'), 30_000);
    this.outageTimer = setTimeout(() => {
      const call = this.latest?.call;
      if (call && !this.recoveryRequested) { this.recoveryRequested = true; void this.send({ v: 1, type: 'recover', callId: call.id }).catch(() => {}); }
    }, 5000);
  }
  private clearOutage(): void { clearTimeout(this.outageTimer); clearTimeout(this.recoveryTimer); this.outageTimer = undefined; this.recoveryTimer = undefined; this.recoveryRequested = false; }
  private async statistics(peer: RTCPeerConnection, epoch: number): Promise<void> {
    if (!this.valid(epoch) || this.peer !== peer) return;
    try {
      const reports = await peer.getStats(); if (!this.valid(epoch)) return;
      let sent = 0, received = 0, frames = 0, audioPackets = 0, lost = 0, localCandidates = 0, remoteCandidates = 0, checksSent = 0, repliesReceived = 0, pair: RTCStats | undefined;
      reports.forEach(report => {
        if (report.type === 'outbound-rtp') sent += report.bytesSent ?? 0;
        if (report.type === 'inbound-rtp') { received += report.bytesReceived ?? 0; lost += report.packetsLost ?? 0; if (report.kind === 'video') frames += report.framesDecoded ?? 0; if (report.kind === 'audio') audioPackets += report.packetsReceived ?? 0; }
        if (report.type === 'transport' && report.selectedCandidatePairId) pair = reports.get(report.selectedCandidatePairId);
        if (report.type === 'local-candidate') localCandidates++;
        if (report.type === 'remote-candidate') remoteCandidates++;
        if (report.type === 'candidate-pair') { checksSent += report.requestsSent ?? 0; repliesReceived += report.responsesReceived ?? 0; }
      });
      const now = Date.now(), seconds = (now - this.lastStats.at) / 1000;
      if (frames > this.lastStats.frames) this.lastStats.frameAt = now;
      const remoteRole = this.latest?.role === 'host' ? 'guest' : 'host';
      const remoteVideo = this.latest?.call?.media[remoteRole].video;
      this.value.stale = !!remoteVideo && peer.connectionState === 'connected' && now - this.lastStats.frameAt >= 5000;
      if (this.value.stale) this.outage(); else if (peer.connectionState === 'connected') this.clearOutage();
      const selected = pair as Record<string, unknown> | undefined;
      const local = selected ? reports.get(String(selected.localCandidateId)) : null, remote = selected ? reports.get(String(selected.remoteCandidateId)) : null;
      const address = local?.address;
      const tailscale = typeof address === 'string' && (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address) || address.startsWith('fd7a:115c:a1e0:'));
      const capture = this.stream?.getVideoTracks()[0]?.getSettings();
      this.value.stats = { captureWidth: capture?.width ?? 0, captureHeight: capture?.height ?? 0, captureFps: Math.round(capture?.frameRate ?? 0), connection: peer.connectionState, ice: peer.iceConnectionState, route: tailscale ? 'Tailscale candidate observed' : address ? 'Other direct candidate observed' : 'Candidate address unavailable',
        localCandidate: local?.candidateType ?? 'unknown', remoteCandidate: remote?.candidateType ?? 'unknown', transport: local?.protocol ?? 'unknown',
        rttMs: Math.round(Number(selected?.currentRoundTripTime ?? 0) * 1000), localCandidates, remoteCandidates, checksSent, repliesReceived, receivedVideoFrames: frames, receivedAudioPackets: audioPackets, packetsLost: lost,
        sendKbps: this.lastStats.at ? Math.max(0, Math.round((sent - this.lastStats.sent) * 8 / seconds / 1000)) : 0,
        receiveKbps: this.lastStats.at ? Math.max(0, Math.round((received - this.lastStats.received) * 8 / seconds / 1000)) : 0 };
      this.lastStats = { ...this.lastStats, at: now, sent, received, frames }; this.changed();
    } catch { /* A closed peer may finish a pending statistics request. */ }
  }
  private fail(message: string): void { this.hangup(); this.value.error = message; this.value.connection = 'error'; this.changed(); }
  hangup(): void {
    const call = this.latest?.call;
    if (call) void this.send({ v: 1, type: call.phase === 'ringing' ? call.caller === this.latest?.role ? 'cancel' : 'reject' : 'hangup', callId: call.id }).catch(() => {});
    this.stop('Call ended');
  }
  stop(reason = ''): void {
    this.epoch++; clearTimeout(this.initialTimer); clearTimeout(this.captureTimer); clearTimeout(this.requestTimer); clearInterval(this.statsTimer); this.clearOutage();
    this.initialTimer = undefined; this.captureTimer = undefined; this.requestTimer = undefined; this.statsTimer = undefined;
    this.peer?.close(); this.peer = null; this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.wantedCamera = false;
    this.view.local.srcObject = null; this.view.remote.srcObject = null; this.view.remote.pause();
    this.offered = 0; this.remoteGeneration = 0; this.localGeneration = 0; this.earlyIce = []; this.localIce = []; this.localUfrags.clear(); this.queue = Promise.resolve();
    this.value = { capturing: false, muted: false, cameraOn: false, error: reason || null, audioOnlyOffered: false, connection: 'ended', stale: false, stats: {} };
    void this.bridge.releaseCapture(); this.changed();
  }
}
