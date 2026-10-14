import { randomUUID } from 'node:crypto';
import { otherRole, type CallSnapshot, type ClientMessage, type EndReason, type Role, type ServerMessage } from './protocol.ts';
export class Coordinator {
  private peers = new Map<Role, (message: ServerMessage) => void>();
  private call: CallSnapshot | null = null;
  private started = 0;
  private recoveryDeadline: number | null = null;
  private connected = new Set<Role>();
  private offered = false;
  private answered = false;
  private restarted = false;
  get snapshot(): CallSnapshot | null { return this.call ? structuredClone(this.call) : null; }
  isOnline(role: Role): boolean { return this.peers.has(role); }
  attach(role: Role, send: (message: ServerMessage) => void, _now: number): boolean {
    if (this.peers.has(role)) return false;
    this.peers.set(role, send); this.publish(); return true;
  }
  detach(role: Role, now: number): void {
    this.peers.delete(role); this.connected.delete(role);
    if (this.call?.phase === 'ringing') this.end('peer-left');
    else if (this.call) this.recovering(now);
    this.publish();
  }
  private send(role: Role, message: ServerMessage): void { this.peers.get(role)?.(message); }
  private publish(): void {
    for (const role of this.peers.keys()) this.send(role, { v: 1, type: 'state', role, peerOnline: this.isOnline(otherRole(role)), call: this.snapshot });
  }
  private error(role: Role, code: string, message: string): void { this.send(role, { v: 1, type: 'error', code, message }); }
  private recovering(now: number): void {
    if (!this.call) return;
    this.call.phase = 'reconnecting'; this.recoveryDeadline ??= now + 30_000;
  }
  receive(role: Role, message: ClientMessage, now: number): void {
    if (!this.peers.has(role)) return;
    this.tick(now);
    if (message.type === 'sync') { this.publish(); return; }
    if (message.type === 'request') {
      if (!this.isOnline(otherRole(role))) { this.error(role, 'peer-unavailable', 'Your partner is not connected. Both apps must be open.'); return; }
      if (this.call?.phase === 'ringing') {
        if (this.call.caller !== role) { this.call.phase = 'connecting'; this.started = now; }
      } else if (this.call) { this.error(role, 'busy', 'A call is already active.'); return; }
      else {
        this.call = { id: randomUUID(), caller: role, phase: 'ringing', generation: 1,
          media: { host: { audio: false, video: false }, guest: { audio: false, video: false } } };
        this.started = now; this.connected.clear(); this.offered = false; this.answered = false; this.restarted = false;
      }
      this.publish(); return;
    }
    const call = this.call;
    if (!call || !('callId' in message) || message.callId !== call.id) { this.error(role, 'stale-call', 'This call has ended.'); return; }
    if ('generation' in message && message.generation !== call.generation) { this.error(role, 'stale-generation', 'Ignored an obsolete negotiation.'); return; }
    if (message.type === 'hangup') { this.end('hangup'); return; }
    if (message.type === 'cancel' && call.phase === 'ringing' && call.caller === role) { this.end('cancelled'); return; }
    if (message.type === 'reject' && call.phase === 'ringing' && call.caller !== role) { this.end('rejected'); return; }
    if (message.type === 'accept' && call.phase === 'ringing' && call.caller !== role) { call.phase = 'connecting'; this.started = now; this.publish(); return; }
    if (message.type === 'media') { call.media[role] = { audio: message.audio, video: message.video }; this.publish(); return; }
    if (message.type === 'recover' && call.phase !== 'ringing') {
      this.recovering(now);
      if (!this.restarted && this.isOnline('host') && this.isOnline('guest')) {
        this.restarted = true; call.generation++; this.connected.clear(); this.offered = false; this.answered = false;
      }
      this.publish(); return;
    }
    if (message.type === 'connected' && call.phase !== 'ringing' && this.answered) {
      if (this.connected.has(role)) return;
      this.connected.add(role);
      if (this.connected.size === 2) { call.phase = 'connected'; this.recoveryDeadline = null; this.restarted = false; }
      this.publish(); return;
    }
    if (message.type === 'description' && call.phase !== 'ringing') {
      if (message.description.type === 'offer' && role === 'host' && !this.offered) this.offered = true;
      else if (message.description.type === 'answer' && role === 'guest' && this.offered && !this.answered) this.answered = true;
      else { this.error(role, 'invalid-state', 'Unexpected negotiation message.'); return; }
      this.send(otherRole(role), message); return;
    }
    if (message.type === 'ice' && call.phase !== 'ringing') { this.send(otherRole(role), message); return; }
    this.error(role, 'invalid-state', 'That action is not available in the current call.');
  }
  tick(now: number): void {
    if (this.recoveryDeadline !== null && now >= this.recoveryDeadline) this.end('recovery-timeout');
    else if (this.call?.phase === 'ringing' && now - this.started >= 60_000) this.end('ring-timeout');
    else if (this.call?.phase === 'connecting' && now - this.started >= 30_000) this.end('connect-timeout');
  }
  end(reason: EndReason): void {
    if (!this.call) return;
    const callId = this.call.id; this.call = null; this.recoveryDeadline = null; this.connected.clear();
    for (const role of this.peers.keys()) this.send(role, { v: 1, type: 'ended', callId, reason });
    this.publish();
  }
}
