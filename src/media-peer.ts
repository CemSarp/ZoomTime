import type { ClientMessage, MediaStatus, PeerSnapshot, ServerMessage } from './protocol.ts';
export interface MediaPeerState { connection: string; stale: boolean; error: string | null; audioLevel: number | null; stats: Record<string, string | number> }
interface PeerOptions { selfId: string; callId: string; snapshot: PeerSnapshot; stream: MediaStream; remote: HTMLVideoElement; send(message: ClientMessage): Promise<void>; changed(): void }
export class MediaPeer {
  readonly connection: RTCPeerConnection;
  readonly remoteId: string;
  private options: PeerOptions;
  private snapshot: PeerSnapshot;
  private stream: MediaStream;
  private remoteMedia: MediaStatus = { audio: false, video: false };
  private value: MediaPeerState = { connection: 'new', stale: false, error: null, audioLevel: null, stats: {} };
  private closed = false;
  private queue = Promise.resolve();
  private offered = 0;
  private remoteGeneration = 0;
  private localGeneration = 0;
  private earlyIce: { generation: number; candidate: RTCIceCandidateInit | null }[] = [];
  private localIce: RTCIceCandidateInit[] = [];
  private ufrags = new Map<string, number>();
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private outageTimer: ReturnType<typeof setTimeout> | undefined;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private recoveryRequested = false;
  private statsBusy = false;
  private last = { at: 0, sent: 0, received: 0, frames: 0, frameAt: Date.now() };
  constructor(options: PeerOptions) {
    this.options = options; this.snapshot = options.snapshot; this.stream = options.stream;
    this.remoteId = options.snapshot.a === options.selfId ? options.snapshot.b : options.snapshot.a;
    const peer = new RTCPeerConnection({ iceServers: [] }); this.connection = peer;
    peer.ontrack = event => {
      if (this.closed) return;
      const remote = this.options.remote;
      const stream = remote.srcObject instanceof MediaStream ? remote.srcObject : new MediaStream();
      if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
      if (remote.srcObject !== stream) remote.srcObject = stream;
      void this.resumeAudio().catch(() => {});
    };
    peer.onicecandidate = event => {
      if (this.closed || !event.candidate) return;
      if (this.localIce.length >= 100) { this.fail('Too many pending ICE candidates.'); return; }
      this.localIce.push(event.candidate.toJSON()); this.flushIce();
    };
    peer.onconnectionstatechange = () => {
      if (this.closed) return;
      this.value.connection = peer.connectionState;
      if (peer.connectionState === 'connected') {
        clearTimeout(this.initialTimer); this.initialTimer = undefined;
        if (!this.value.stale) this.clearOutage(); this.confirmConnected();
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') this.outage();
      this.changed();
    };
    this.initialTimer = setTimeout(() => this.fail('Media did not connect within 30 seconds. No STUN/TURN fallback is configured.'), 30_000);
    this.statsTimer = setInterval(() => { void this.statistics(); }, 500);
  }
  get state(): MediaPeerState { return { ...this.value, stats: { ...this.value.stats } }; }
  get pairId(): string { return this.snapshot.id; }
  private changed(): void { this.options.changed(); }
  private valid(generation: number): boolean { return !this.closed && this.snapshot.generation === generation; }
  private base() { return { v: 2 as const, callId: this.options.callId, pairId: this.snapshot.id, generation: this.snapshot.generation }; }
  private serial(operation: () => Promise<void>, captureUpdate = false): Promise<void> {
    const generation = this.snapshot.generation;
    this.queue = this.queue.then(async () => { if (!this.closed && (captureUpdate || this.valid(generation))) await operation(); }).catch(() => {
      if (!this.closed && (captureUpdate || this.valid(generation))) this.fail('Media negotiation failed for this participant. Check devices and the private network.');
    }); return this.queue;
  }
  apply(snapshot: PeerSnapshot, remoteMedia: MediaStatus): void {
    if (this.closed) return;
    if (snapshot.generation !== this.snapshot.generation) { this.earlyIce = []; this.localIce = []; }
    this.snapshot = snapshot; this.remoteMedia = remoteMedia;
    if (snapshot.phase === 'failed') { this.fail('This participant’s media connection failed. Other working connections continue.', false); return; }
    if (this.options.selfId === snapshot.offererId && this.offered < snapshot.generation) {
      this.offered = snapshot.generation; void this.serial(() => this.offer(snapshot.generation));
    }
    this.confirmConnected();
  }
  private async attachTracks(): Promise<void> {
    for (const transceiver of this.connection.getTransceivers()) {
      if (this.closed) return;
      transceiver.direction = 'sendrecv'; transceiver.sender.setStreams(this.stream);
      await transceiver.sender.replaceTrack(this.stream.getTracks().find(t => t.kind === transceiver.receiver.track.kind) ?? null);
    }
  }
  async replaceTracks(stream: MediaStream): Promise<void> { this.stream = stream; return this.serial(() => this.attachTracks(), true); }
  replaceMicrophone(track: MediaStreamTrack): Promise<void> {
    const operation = this.queue.then(async () => {
      if (this.closed) return;
      const sender = this.connection.getTransceivers().find(t => t.receiver.track.kind === 'audio')?.sender;
      if (sender && sender.track !== track) await sender.replaceTrack(track);
    });
    // An optional audio-setting failure is recoverable and must not close the peer.
    this.queue = operation.catch(() => {}); return operation;
  }
  private async offer(generation: number): Promise<void> {
    const peer = this.connection;
    if (!peer.getTransceivers().length) {
      for (const kind of ['audio', 'video'] as const) peer.addTransceiver(kind, { direction: 'sendrecv', streams: [this.stream] });
    }
    await this.attachTracks(); if (!this.valid(generation)) return;
    const offer = await peer.createOffer({ iceRestart: generation > 1 }); if (!this.valid(generation)) return;
    await peer.setLocalDescription(offer); if (!this.valid(generation)) return;
    await this.options.send({ ...this.base(), type: 'description', description: { type: 'offer', sdp: peer.localDescription!.sdp } });
    if (this.valid(generation)) this.rememberLocal(generation);
  }
  private rememberLocal(generation: number): void {
    this.localGeneration = generation;
    for (const match of this.connection.localDescription!.sdp.matchAll(/^a=ice-ufrag:(.+)$/gm)) this.ufrags.set(match[1].trim(), generation);
    while (this.ufrags.size > 8) this.ufrags.delete(this.ufrags.keys().next().value!);
    this.flushIce();
  }
  private flushIce(): void {
    if (!this.localGeneration || this.closed) return;
    const remaining: RTCIceCandidateInit[] = [];
    for (const candidate of this.localIce) {
      const generation = candidate.usernameFragment ? this.ufrags.get(candidate.usernameFragment) : this.localGeneration;
      if (!generation) remaining.push(candidate);
      else if (generation === this.snapshot.generation) void this.options.send({ ...this.base(), type: 'ice', candidate }).catch(() => {});
    }
    this.localIce = remaining;
  }
  async handleSignal(message: ServerMessage): Promise<void> {
    if ((message.type !== 'description' && message.type !== 'ice') || message.callId !== this.options.callId || message.pairId !== this.snapshot.id || message.fromId !== this.remoteId || !this.valid(message.generation)) return;
    return this.serial(async () => {
      const generation = message.generation, peer = this.connection;
      if (message.type === 'ice') {
        if (this.remoteGeneration !== generation || !peer.remoteDescription) {
          if (this.earlyIce.length >= 100) throw new Error('Too many early candidates');
          this.earlyIce.push({ generation, candidate: message.candidate }); return;
        }
        await peer.addIceCandidate(message.candidate); return;
      }
      if ((this.options.selfId === this.snapshot.offererId) !== (message.description.type === 'answer')) throw new Error('Wrong offerer');
      await peer.setRemoteDescription(message.description); if (!this.valid(generation)) return;
      this.remoteGeneration = generation;
      if (message.description.type === 'offer') { await this.attachTracks(); if (!this.valid(generation)) return; }
      const candidates = this.earlyIce; this.earlyIce = [];
      for (const item of candidates) if (item.generation === generation) { await peer.addIceCandidate(item.candidate); if (!this.valid(generation)) return; }
      if (message.description.type === 'offer') {
        const answer = await peer.createAnswer(); if (!this.valid(generation)) return;
        await peer.setLocalDescription(answer); if (!this.valid(generation)) return;
        await this.options.send({ ...this.base(), type: 'description', description: { type: 'answer', sdp: peer.localDescription!.sdp } });
        if (!this.valid(generation)) return; this.rememberLocal(generation);
      }
      this.confirmConnected();
    });
  }
  private confirmConnected(): void {
    if (!this.closed && !this.value.stale && this.snapshot.phase !== 'connected' && this.connection.connectionState === 'connected' && this.localGeneration === this.snapshot.generation && this.remoteGeneration === this.snapshot.generation)
      void this.options.send({ ...this.base(), type: 'connected' }).catch(() => {});
  }
  private outage(): void {
    if (this.closed || this.recoveryTimer) return;
    this.recoveryTimer = setTimeout(() => this.fail('Media recovery exceeded 30 seconds. No STUN/TURN fallback is configured.'), 30_000);
    this.outageTimer = setTimeout(() => {
      if (!this.closed && !this.recoveryRequested) { this.recoveryRequested = true; void this.options.send({ ...this.base(), type: 'recover' }).catch(() => {}); }
    }, 5000);
  }
  private clearOutage(): void {
    clearTimeout(this.outageTimer); clearTimeout(this.recoveryTimer); this.outageTimer = undefined; this.recoveryTimer = undefined; this.recoveryRequested = false;
  }
  private async statistics(): Promise<void> {
    if (this.closed || this.statsBusy) return;
    this.statsBusy = true;
    try {
      const reports = await this.connection.getStats(); if (this.closed) return;
      let sent = 0, received = 0, frames = 0, decoded = 0, audioPackets = 0, lost = 0, localCandidates = 0, remoteCandidates = 0, checksSent = 0, repliesReceived = 0, audioLevel: number | null = null, pair: RTCStats | undefined;
      reports.forEach(report => {
        if (report.type === 'outbound-rtp') sent += report.bytesSent ?? 0;
        if (report.type === 'inbound-rtp') {
          received += report.bytesReceived ?? 0; lost += report.packetsLost ?? 0;
          if (report.kind === 'video') { frames += report.framesReceived ?? report.framesDecoded ?? 0; decoded += report.framesDecoded ?? 0; }
          if (report.kind === 'audio') { audioPackets += report.packetsReceived ?? 0; if (typeof report.audioLevel === 'number' && Number.isFinite(report.audioLevel) && report.audioLevel >= 0 && report.audioLevel <= 1) audioLevel = report.audioLevel; }
        }
        if (report.type === 'transport' && report.selectedCandidatePairId) pair = reports.get(report.selectedCandidatePairId);
        if (report.type === 'local-candidate') localCandidates++;
        if (report.type === 'remote-candidate') remoteCandidates++;
        if (report.type === 'candidate-pair') { checksSent += report.requestsSent ?? 0; repliesReceived += report.responsesReceived ?? 0; }
      });
      const now = Date.now(), seconds = (now - this.last.at) / 1000;
      if (frames > this.last.frames) this.last.frameAt = now;
      this.value.stale = this.remoteMedia.video && (this.connection.connectionState === 'connected' || this.value.stale) && now - this.last.frameAt >= 5000;
      this.value.audioLevel = this.remoteMedia.audio && !this.value.stale && this.connection.connectionState === 'connected' ? audioLevel : null;
      if (this.value.stale) this.outage(); else if (this.connection.connectionState === 'connected') { this.clearOutage(); this.confirmConnected(); }
      const selected = pair as Record<string, unknown> | undefined;
      const local = selected ? reports.get(String(selected.localCandidateId)) : null, remote = selected ? reports.get(String(selected.remoteCandidateId)) : null;
      const address = local?.address;
      const tailscale = typeof address === 'string' && (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address) || address.startsWith('fd7a:115c:a1e0:'));
      this.value.stats = { connection: this.connection.connectionState, ice: this.connection.iceConnectionState,
        route: tailscale ? 'Tailscale candidate observed' : address ? 'Other direct candidate observed' : 'Candidate address unavailable',
        localCandidate: local?.candidateType ?? 'unknown', remoteCandidate: remote?.candidateType ?? 'unknown', transport: local?.protocol ?? 'unknown',
        rttMs: Math.round(Number(selected?.currentRoundTripTime ?? 0) * 1000), localCandidates, remoteCandidates, checksSent, repliesReceived,
        receivedVideoFrames: frames, decodedVideoFrames: decoded, receivedAudioPackets: audioPackets, packetsLost: lost,
        sendKbps: this.last.at && seconds > 0 ? Math.max(0, Math.round((sent - this.last.sent) * 8 / seconds / 1000)) : 0,
        receiveKbps: this.last.at && seconds > 0 ? Math.max(0, Math.round((received - this.last.received) * 8 / seconds / 1000)) : 0 };
      this.last = { ...this.last, at: now, sent, received, frames }; this.changed();
    } catch { /* A pending stats request can finish after close. */ }
    finally { this.statsBusy = false; }
  }
  async resumeAudio(): Promise<void> {
    if (this.closed) return;
    try { await this.options.remote.play(); if (this.value.error === 'Click Resume audio to start participant playback.') { this.value.error = null; this.changed(); } }
    catch { if (!this.closed) { this.value.error = 'Click Resume audio to start participant playback.'; this.changed(); } throw new Error('Click Resume audio to start participant playback.'); }
  }
  private fail(message: string, report = true): void {
    if (this.closed) return;
    if (report) void this.options.send({ ...this.base(), type: 'failed' }).catch(() => {});
    this.close(); this.value.connection = 'failed'; this.value.error = message; this.changed();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.initialTimer); clearInterval(this.statsTimer); this.clearOutage();
    this.connection.ontrack = null; this.connection.onicecandidate = null; this.connection.onconnectionstatechange = null; this.connection.close();
    this.options.remote.srcObject = null; this.options.remote.pause(); this.value.audioLevel = null;
    this.earlyIce = []; this.localIce = []; this.ufrags.clear();
  }
}
