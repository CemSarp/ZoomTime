import { approvedEndpoint, parseClientMessage, parseInvitation, type CallSnapshot, type Role, type ServerMessage } from './protocol.ts';
import { newHostPairing, readPairing, writePairing, type Pairing, type SecretCodec } from './pairing.ts';
import { SignalingClient, type NetworkStatus } from './signaling-client.ts';
import { startSignaling } from './signaling.ts';
export interface CallingState { role: Role | null; endpoint: string | null; network: NetworkStatus; peerOnline: boolean; call: CallSnapshot | null; error: string | null }
export type CallingEvent = { type: 'state'; state: CallingState } | { type: 'signal'; message: ServerMessage } | { type: 'stop'; reason: string };
export type CaptureAction = 'call' | 'accept' | 'camera' | 'devices';
export class CallingService {
  private file: string;
  private codec: SecretCodec;
  private publish: (event: CallingEvent) => void;
  private pairing: Pairing | null = null;
  private client: SignalingClient | null = null;
  private server: Awaited<ReturnType<typeof startSignaling>> | null = null;
  private starting: ReturnType<typeof startSignaling> | null = null;
  private value: CallingState = { role: null, endpoint: null, network: { state: 'offline', message: 'Pair your two Macs to begin.' }, peerOnline: false, call: null, error: null };
  private capture = false;
  private captureDeadline = 0;
  private recovery: ReturnType<typeof setTimeout> | undefined;
  private ended: string[] = [];
  private revision = 0;
  constructor(file: string, codec: SecretCodec, publish: (event: CallingEvent) => void) { this.file = file; this.codec = codec; this.publish = publish; }
  get state(): CallingState { return structuredClone(this.value); }
  get captureAllowed(): boolean { return this.capture && (this.value.call !== null || Date.now() < this.captureDeadline); }
  private changed(): void { this.publish({ type: 'state', state: this.state }); }
  authorizeCapture(action: unknown): void {
    const call = this.value.call;
    const allowed = this.value.network.state === 'online' && this.pairing &&
      ((action === 'call' && !call && this.value.peerOnline) ||
       (action === 'accept' && call?.phase === 'ringing' && call.caller !== this.value.role) ||
       ((action === 'camera' || action === 'devices') && call && call.phase !== 'ringing'));
    if (!allowed) throw new Error('Capture requires an explicit available Call, Accept or device-recovery action.');
    this.capture = true; this.captureDeadline = Date.now() + 60_000;
  }
  releaseCapture(): void { this.capture = false; this.captureDeadline = 0; }
  async initialize(): Promise<void> {
    try { this.pairing = readPairing(this.file, this.codec); await this.connect(); }
    catch { this.value.error = 'Pairing could not be unlocked. Unlock macOS Keychain and retry, or explicitly reset pairing.'; this.changed(); }
  }
  async createHost(endpoint: unknown): Promise<void> {
    if (this.pairing || this.value.error) throw new Error('Reset existing pairing before creating a new host.');
    const approved = approvedEndpoint(endpoint); if (!approved) throw new Error('Use your private wss://hostname.ts.net:8443/zoomtime endpoint.');
    const pairing = newHostPairing(approved); writePairing(this.file, pairing, this.codec);
    this.pairing = pairing; await this.connect();
  }
  async importInvitation(text: string): Promise<void> {
    if (this.pairing || this.value.error) throw new Error('Reset existing pairing before importing an invitation.');
    let invitation;
    try { if (text.length <= 8192) invitation = parseInvitation(JSON.parse(text)); } catch { /* Do not include clipboard contents in errors. */ }
    if (!invitation) throw new Error('Invalid ZoomTime invitation. Copy a fresh invitation from the host.');
    writePairing(this.file, invitation, this.codec); this.pairing = invitation; await this.connect();
  }
  invitation(): string {
    const p = this.pairing; if (!p || p.role !== 'host') throw new Error('Only the paired host can copy an invitation.');
    return JSON.stringify({ app: 'ZoomTime', v: 1, role: 'guest', endpoint: p.endpoint, token: p.guestToken });
  }
  async reset(): Promise<void> {
    this.server?.coordinator.end('pairing-reset'); this.interrupt('Pairing reset. Copy a new invitation before calling again.');
    try { writePairing(this.file, null, this.codec); }
    catch (error) {
      await this.disconnect(); this.value.error = 'Reset could not be saved. The host is stopped. Unlock Keychain and retry Reset; the previous invitation is not yet revoked on disk.'; this.changed(); throw error;
    }
    await this.disconnect(); this.pairing = null;
    this.value = { role: null, endpoint: null, network: { state: 'offline', message: 'Pair your two Macs to begin.' }, peerOnline: false, call: null, error: null }; this.changed();
  }
  send(value: unknown): void {
    const message = parseClientMessage(value); if (!message || !this.client) throw new Error('Invalid or unavailable call action.');
    if ((message.type === 'request' || message.type === 'accept') && !this.captureAllowed) throw new Error('Start capture explicitly before calling.');
    if ('callId' in message && message.callId !== this.value.call?.id) throw new Error('This call has ended.');
    if (!this.client.send(message)) throw new Error('Private signaling is disconnected. Check the host and Tailscale.');
    if (message.type === 'hangup' || message.type === 'cancel' || message.type === 'reject') this.interrupt('Call ended');
  }
  async retry(): Promise<void> { this.interrupt('Connection retried. Start a new call when ready.'); await this.disconnect(); this.value.error = null; this.pairing = readPairing(this.file, this.codec); await this.connect(); }
  interrupt(reason: string): void {
    const call = this.value.call;
    if (call) { this.client?.send({ v: 1, type: 'hangup', callId: call.id }); this.ended.push(call.id); this.ended = this.ended.slice(-8); }
    this.releaseCapture(); clearTimeout(this.recovery); this.recovery = undefined; this.value.call = null;
    this.publish({ type: 'stop', reason }); this.changed();
  }
  private receive(message: ServerMessage): void {
    if (message.type === 'state') {
      if (message.role !== this.pairing?.role) { this.interrupt('The host returned an invalid participant identity.'); this.client?.stop(); return; }
      if (message.call && this.ended.includes(message.call.id)) { this.client?.send({ v: 1, type: 'hangup', callId: message.call.id }); return; }
      if (message.call && !this.captureAllowed && (message.call.phase !== 'ringing' || message.call.caller === message.role)) {
        this.client?.send({ v: 1, type: 'hangup', callId: message.call.id });
        this.ended.push(message.call.id); this.ended = this.ended.slice(-8);
        this.interrupt('The cancelled call was not resumed. Start a new call explicitly.'); return;
      }
      const previous = this.value.call;
      if (previous && previous.id !== message.call?.id) this.interrupt('The previous call ended.');
      this.value.call = message.call; this.value.peerOnline = message.peerOnline;
      clearTimeout(this.recovery); this.recovery = undefined; this.changed();
    } else if (message.type === 'ended') {
      if (message.callId === this.value.call?.id) this.interrupt(message.reason);
    } else if (message.type === 'error') {
      if (!['stale-call', 'stale-generation'].includes(message.code)) { this.value.error = message.message; this.changed(); }
    } else if (message.callId === this.value.call?.id && message.generation === this.value.call.generation) this.publish({ type: 'signal', message });
  }
  private async connect(): Promise<void> {
    const p = this.pairing; if (!p) { this.changed(); return; }
    const revision = ++this.revision;
    this.value.role = p.role; this.value.endpoint = p.endpoint; this.value.error = null;
    this.value.network = { state: 'connecting', message: 'Connecting to your private host…' }; this.value.peerOnline = false; this.changed();
    if (p.role === 'host' && !this.server) {
      const starting = startSignaling(p); this.starting = starting;
      try {
        const server = await starting;
        if (revision !== this.revision) { await server.close(); return; }
        this.server = server;
      } catch {
        if (revision === this.revision) { this.value.network = { state: 'error', message: 'The local host could not start on port 47831. Close other host instances, then retry.' }; this.changed(); }
        return;
      } finally { if (this.starting === starting) this.starting = null; }
    }
    if (revision !== this.revision) return;
    this.client = new SignalingClient(p.role === 'host' ? 'ws://127.0.0.1:47831/zoomtime' : p.endpoint,
      p.role === 'host' ? p.hostToken : p.token, message => { if (revision === this.revision) this.receive(message); }, status => {
        if (revision !== this.revision) return;
        this.value.network = status;
        if (status.state === 'error') this.interrupt(status.message);
        else if (status.state === 'offline' && this.value.call && !this.recovery) this.recovery = setTimeout(() => this.interrupt('Signaling recovery exceeded 30 seconds. Call ended.'), 30_000);
        this.changed();
      });
    this.client.start(); this.changed();
  }
  private async disconnect(): Promise<void> {
    this.revision++; clearTimeout(this.recovery); this.recovery = undefined; this.client?.stop(); this.client = null;
    this.releaseCapture(); this.value.network = { state: 'offline', message: 'Private signaling disconnected.' }; this.value.peerOnline = false; this.changed();
    const server = this.server, starting = this.starting; this.server = null; this.starting = null;
    if (server) await server.close();
    if (starting) { try { await (await starting).close(); } catch { /* A failed listener never became an active host. */ } }
  }
  async shutdown(): Promise<void> { this.interrupt('App closed'); await this.disconnect(); }
}
