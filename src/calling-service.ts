import { approvedEndpoint, identifier, keys, object, parseClientMessage, parseInvitation, targetIds, type ClientMessage, type ServerMessage } from './protocol.ts';
import { identifyGuest, newHostPairing, readPairing, writePairing, registerMember, renameMember, revokeMember, type HostPairing, type Pairing, type SecretCodec } from './pairing.ts';
import { SignalingClient } from './signaling-client.ts';
import { startSignaling } from './signaling.ts';
import { emptyCallingState, type CallingState, type CallingEvent } from './calling-state.ts';
export { emptyCallingState, type CallingState, type CallingEvent, type StartCall, type CaptureAction } from './calling-state.ts';
type Pending = Extract<ClientMessage, { type: 'request' | 'accept' }>;
export class CallingService {
  private file: string;
  private codec: SecretCodec;
  private publish: (event: CallingEvent) => void;
  private port: number;
  private pairing: Pairing | null = null;
  private client: SignalingClient | null = null;
  private server: Awaited<ReturnType<typeof startSignaling>> | null = null;
  private starting: ReturnType<typeof startSignaling> | null = null;
  private value = emptyCallingState();
  private capture = false;
  private captureDeadline = 0;
  private operationId: string | null = null;
  private pending: Pending | null = null;
  private checkDeadline = 0;
  private checkTimer: ReturnType<typeof setTimeout> | undefined;
  private recovery: ReturnType<typeof setTimeout> | undefined;
  private dismissed: string[] = [];
  private revision = 0;
  constructor(file: string, codec: SecretCodec, publish: (event: CallingEvent) => void, port = 47831) { this.file = file; this.codec = codec; this.publish = publish; this.port = port; }
  get state(): CallingState { return structuredClone(this.value); }
  get localPort(): number | null { return this.server?.port ?? null; }
  get hostingActiveCall(): boolean { return this.server?.coordinator.snapshot !== null && this.server !== null; }
  get inUse(): boolean { return this.hostingActiveCall || this.value.call !== null || this.captureAllowed || this.deviceCheckAllowed; }
  get captureAllowed(): boolean {
    const own = this.value.call?.members.find(m => m.id === this.value.selfId);
    return this.capture && (own?.status === 'joined' && own.operationId === this.operationId || Date.now() < this.captureDeadline);
  }
  get deviceCheckAllowed(): boolean { return Date.now() < this.checkDeadline; }
  authorizeDeviceCheck(): void {
    if (this.value.call || this.captureAllowed || this.deviceCheckAllowed) throw new Error('End the call or current device check before starting another check.');
    this.checkDeadline = Date.now() + 120_000; clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => this.endDeviceCheck('Device check stopped after two minutes.'), 120_000);
  }
  releaseDeviceCheck(): void { this.checkDeadline = 0; clearTimeout(this.checkTimer); this.checkTimer = undefined; }
  endDeviceCheck(reason: string): void { if (!this.checkDeadline) return; this.releaseDeviceCheck(); this.publish({ type: 'check-stop', reason }); }
  private changed(): void { this.publish({ type: 'state', state: this.state }); }
  authorizeCapture(value: unknown): void {
    const call = this.value.call, own = call?.members.find(m => m.id === this.value.selfId);
    if (!object(value) || this.value.network.state !== 'online' || !this.pairing) throw new Error('Capture requires an explicit available call action.');
    if ((value.action === 'camera' || value.action === 'devices') && keys(value, ['action', 'callId']) && value.callId === call?.id && own?.status === 'joined' && this.captureAllowed) return;
    let pending: Pending | null = null;
    if (value.action === 'call' && keys(value, ['action', 'operationId', 'targetIds']) && identifier(value.operationId) && targetIds(value.targetIds) && !call && !this.value.busy &&
      value.targetIds.every(id => id !== this.value.selfId && this.value.members.some(m => m.id === id && m.online))) pending = { v: 2, type: 'request', operationId: value.operationId, targetIds: [...value.targetIds] };
    if (value.action === 'accept' && keys(value, ['action', 'operationId', 'callId', 'invitationId']) && identifier(value.operationId) && value.callId === call?.id && own?.status === 'invited' && own.invitationId === value.invitationId && !this.dismissed.includes(String(value.invitationId)))
      pending = { v: 2, type: 'accept', operationId: value.operationId, callId: call!.id, invitationId: value.invitationId as string };
    if (!pending || this.captureAllowed) throw new Error('Capture requires an explicit available Call, Accept or device-recovery action.');
    this.endDeviceCheck('Device check stopped for the call.'); this.pending = pending; this.operationId = pending.operationId;
    this.capture = true; this.captureDeadline = Date.now() + 60_000;
  }
  releaseCapture(): void { this.capture = false; this.captureDeadline = 0; this.operationId = null; this.pending = null; }
  async initialize(): Promise<void> {
    try { this.pairing = readPairing(this.file, this.codec); await this.connect(); }
    catch { this.value.error = 'Pairing could not be unlocked. Unlock macOS Keychain and retry, or explicitly reset pairing.'; this.changed(); }
  }
  async createHost(endpoint: unknown): Promise<void> {
    if (this.pairing || this.value.error) throw new Error('Reset existing pairing before creating a new host.');
    const approved = approvedEndpoint(endpoint); if (!approved) throw new Error('Use your private wss://hostname.ts.net:8443/zoomtime endpoint.');
    const pairing = newHostPairing(approved); writePairing(this.file, pairing, this.codec); this.pairing = pairing; await this.connect();
  }
  async importInvitation(text: string): Promise<void> {
    if (this.pairing || this.value.error) throw new Error('Reset existing pairing before importing an invitation.');
    let invitation;
    try { if (text.length <= 8192) invitation = parseInvitation(JSON.parse(text)); } catch { /* Never echo clipboard text. */ }
    if (!invitation) throw new Error('Invalid ZoomTime invitation. Copy a fresh invitation from the host.');
    writePairing(this.file, invitation, this.codec); this.pairing = invitation; await this.connect();
  }
  private host(): HostPairing { if (this.pairing?.role !== 'host') throw new Error('Only the paired host can manage members.'); return this.pairing; }
  private saveHost(next: HostPairing): void {
    writePairing(this.file, next, this.codec); this.pairing = next; this.server?.updatePairing(next);
    this.value.members = next.members.map(({ id, name }) => ({ id, name, online: this.server?.coordinator.isOnline(id) ?? false })); this.changed();
  }
  addMember(name: unknown): void { this.saveHost(registerMember(this.host(), name)); }
  renameMember(id: unknown, name: unknown): void { this.saveHost(renameMember(this.host(), id, name)); }
  revokeMember(id: unknown): void { this.saveHost(revokeMember(this.host(), id)); }
  invitation(id: unknown): string {
    const p = this.host(), member = p.members.find(m => m.id === id && m.id !== p.hostId);
    if (!member) throw new Error('Select a paired guest before copying its invitation.');
    return JSON.stringify({ app: 'ZoomTime', v: 2, role: 'guest', endpoint: p.endpoint, token: member.token, groupId: p.groupId, hostId: p.hostId, participantId: member.id });
  }
  async reset(): Promise<void> {
    this.server?.coordinator.end('pairing-reset'); this.interrupt('Pairing reset. A fresh pairing invitation is required.');
    try { writePairing(this.file, null, this.codec); }
    catch (error) { await this.disconnect(); this.value.error = 'Reset could not be saved. The host is stopped; previous credentials are not yet revoked on disk. Unlock Keychain and retry Reset.'; this.changed(); throw error; }
    await this.disconnect(); this.pairing = null; this.value = emptyCallingState(); this.changed();
  }
  send(value: unknown): void {
    const message = parseClientMessage(value); if (!message || !this.client) throw new Error('Invalid or unavailable call action.');
    if (message.type === 'request' || message.type === 'accept') {
      if (!this.captureAllowed || !this.pending || message.type !== this.pending.type || message.operationId !== this.pending.operationId || (message.type === 'request' && this.pending.type === 'request' ? JSON.stringify([...message.targetIds].sort()) !== JSON.stringify([...this.pending.targetIds].sort()) : message.type === 'accept' && this.pending.type === 'accept' ? message.callId !== this.pending.callId || message.invitationId !== this.pending.invitationId : true)) throw new Error('Start capture explicitly for these exact recipients or invitation.');
    }
    if ('callId' in message && message.callId !== this.value.call?.id) throw new Error('This call has ended.');
    const own = this.value.call?.members.find(m => m.id === this.value.selfId);
    if ('pairId' in message && !this.value.call?.pairs.some(p => p.id === message.pairId && (p.a === this.value.selfId || p.b === this.value.selfId) && p.generation === message.generation)) throw new Error('This media connection has ended.');
    if (message.type === 'invite' && own?.status !== 'joined') throw new Error('Join the call before inviting members.');
    if (!this.client.send(message)) throw new Error('Private signaling is disconnected. Check the host and Tailscale.');
    if (message.type === 'hangup' || message.type === 'cancel' || message.type === 'reject') this.stopLocal('You left the call.', false);
  }
  async retry(): Promise<void> {
    if (this.hostingActiveCall) throw new Error('Keep the host open during the active group call. Retry after everyone leaves.');
    this.interrupt('Connection retried. Start a new call when ready.'); await this.disconnect(); this.value.error = null;
    this.pairing = readPairing(this.file, this.codec); await this.connect();
  }
  interrupt(reason: string, endHostedCall = false): void {
    if (endHostedCall) this.server?.coordinator.end('sleep');
    this.stopLocal(reason, true);
  }
  private stopLocal(reason: string, notify: boolean): void {
    this.endDeviceCheck(reason);
    const call = this.value.call, own = call?.members.find(m => m.id === this.value.selfId);
    if (own?.status === 'invited' && own.invitationId) {
      this.dismissed.push(own.invitationId); this.dismissed = this.dismissed.slice(-32);
      if (notify) this.client?.send({ v: 2, type: 'reject', callId: call!.id, invitationId: own.invitationId });
    } else if (own?.status === 'joined' && notify) this.client?.send({ v: 2, type: 'hangup', callId: call!.id });
    this.releaseCapture(); clearTimeout(this.recovery); this.recovery = undefined; this.value.call = null;
    this.publish({ type: 'stop', reason }); this.changed();
  }
  private receive(message: ServerMessage): void {
    if (message.type === 'state') {
      const p = this.pairing; if (!p) return;
      if (p.role === 'host' ? message.selfId !== p.hostId || message.hostId !== p.hostId || message.groupId !== p.groupId : message.selfId === message.hostId || p.v === 2 && (message.selfId !== p.participantId || message.groupId !== p.groupId || message.hostId !== p.hostId)) {
        this.interrupt('The host returned an invalid participant identity.'); this.client?.stop(); return;
      }
      if (p.role === 'guest' && p.v === 1) {
        try { this.pairing = identifyGuest(this.file, p, message, this.codec); }
        catch { this.interrupt('Keychain could not save the upgraded pairing. Unlock it and retry.'); this.client?.stop(); return; }
      }
      const own = message.call?.members.find(m => m.id === message.selfId);
      if (own?.status === 'joined' && (!this.captureAllowed || own.operationId !== this.operationId)) {
        this.client?.send({ v: 2, type: 'hangup', callId: message.call!.id }); this.stopLocal('The cancelled call was not resumed. Start a new call explicitly.', false); return;
      }
      if (own?.status === 'invited' && own.invitationId && this.dismissed.includes(own.invitationId)) {
        this.client?.send({ v: 2, type: 'reject', callId: message.call!.id, invitationId: own.invitationId }); return;
      }
      const previous = this.value.call;
      if (previous && (!message.call || previous.id !== message.call.id)) this.stopLocal('The previous call ended.', false);
      if (message.call) this.endDeviceCheck('Device check stopped for an incoming call.');
      this.value.selfId = message.selfId; this.value.hostId = message.hostId; this.value.groupId = message.groupId;
      this.value.members = message.members; this.value.busy = message.busy; this.value.call = message.call;
      if (own?.status === 'joined') this.pending = null;
      clearTimeout(this.recovery); this.recovery = undefined; this.changed();
    } else if (message.type === 'ended') { if (message.callId === this.value.call?.id) this.stopLocal(message.reason, false); }
    else if (message.type === 'error') {
      if (!['stale-call', 'stale-generation', 'stale-invitation'].includes(message.code)) {
        if (this.pending) this.stopLocal(message.message, false);
        this.value.error = message.message; this.changed();
      }
    } else {
      const pair = this.value.call?.pairs.find(p => p.id === message.pairId && p.generation === message.generation);
      if (message.callId === this.value.call?.id && pair && (pair.a === this.value.selfId && pair.b === message.fromId || pair.b === this.value.selfId && pair.a === message.fromId)) this.publish({ type: 'signal', message });
    }
  }
  private async connect(): Promise<void> {
    const p = this.pairing; if (!p) { this.changed(); return; }
    const revision = ++this.revision; this.value.role = p.role; this.value.endpoint = p.endpoint; this.value.error = null;
    if (p.role === 'host') { this.value.selfId = p.hostId; this.value.hostId = p.hostId; this.value.groupId = p.groupId; this.value.members = p.members.map(({ id, name }) => ({ id, name, online: false })); }
    this.value.network = { state: 'connecting', message: 'Connecting to your private host…' }; this.changed();
    if (p.role === 'host' && !this.server) {
      const starting = startSignaling(p, this.port); this.starting = starting;
      try {
        const server = await starting; if (revision !== this.revision) { await server.close(); return; } this.server = server;
      } catch {
        if (revision === this.revision) { this.value.network = { state: 'error', message: 'The local host could not start. Close other host instances, then retry.' }; this.changed(); } return;
      } finally { if (this.starting === starting) this.starting = null; }
    }
    if (revision !== this.revision) return;
    this.client = new SignalingClient(p.role === 'host' ? `ws://127.0.0.1:${this.server!.port}/zoomtime` : p.endpoint,
      p.role === 'host' ? p.members.find(m => m.id === p.hostId)!.token : p.token,
      message => { if (revision === this.revision) this.receive(message); }, status => {
        if (revision !== this.revision) return; this.value.network = status;
        if (status.state === 'error') this.interrupt(status.message);
        else if (status.state === 'offline' && this.value.call && !this.recovery) this.recovery = setTimeout(() => this.interrupt('Signaling recovery exceeded 30 seconds. Call ended.'), 30_000);
        this.changed();
      });
    this.client.start(); this.changed();
  }
  private async disconnect(): Promise<void> {
    this.revision++; clearTimeout(this.recovery); this.recovery = undefined; this.client?.stop(); this.client = null; this.releaseCapture();
    this.value.network = { state: 'offline', message: 'Private signaling disconnected.' }; this.value.members = this.value.members.map(m => ({ ...m, online: false })); this.changed();
    const server = this.server, starting = this.starting; this.server = null; this.starting = null;
    if (server) await server.close(); if (starting) { try { await (await starting).close(); } catch { /* Listener never started. */ } }
  }
  async shutdown(): Promise<void> { this.server?.coordinator.end('peer-left'); this.interrupt('App closed'); await this.disconnect(); }
}
