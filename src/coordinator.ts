import { randomUUID } from 'node:crypto';
import { parseClientMessage, type CallMember, type CallSnapshot, type ClientMessage, type EndReason, type Member, type PeerSnapshot, type ServerMessage } from './protocol.ts';
interface Negotiation { deadline: number | null; offered: boolean; answered: boolean; restarted: boolean; connected: Set<string> }
export class Coordinator {
  private groupId: string;
  private hostId: string;
  private members: Pick<Member, 'id' | 'name'>[];
  private peers = new Map<string, (message: ServerMessage) => void>();
  private call: CallSnapshot | null = null;
  private negotiations = new Map<string, Negotiation>();
  private disconnected = new Map<string, number>();
  private hadTwo = false;
  constructor(groupId: string, hostId: string, members: Pick<Member, 'id' | 'name'>[]) {
    this.groupId = groupId; this.hostId = hostId; this.members = members.map(({ id, name }) => ({ id, name }));
  }
  get snapshot(): CallSnapshot | null { return this.call ? structuredClone(this.call) : null; }
  isOnline(id: string): boolean { return this.peers.has(id); }
  isPairMember(id: string, pairId: string): boolean { return !!this.call?.pairs.some(p => p.id === pairId && (p.a === id || p.b === id)); }
  attach(id: string, send: (message: ServerMessage) => void, now: number): boolean {
    if (this.peers.has(id) || !this.members.some(m => m.id === id)) return false;
    this.tick(now);
    this.peers.set(id, send); this.disconnected.delete(id); this.publish(); return true;
  }
  detach(id: string, now: number): void {
    if (!this.peers.delete(id)) return;
    this.disconnected.set(id, now + 30_000);
    for (const p of this.call?.pairs ?? []) if (p.a === id || p.b === id) {
      if (p.phase !== 'failed') p.phase = 'reconnecting';
      this.negotiations.get(p.id)?.connected.delete(id);
    }
    this.publish();
  }
  updateMembers(members: Pick<Member, 'id' | 'name'>[], now: number): void {
    for (const old of this.members) if (!members.some(m => m.id === old.id)) {
      this.leave(old.id, 'peer-left'); this.peers.delete(old.id); this.disconnected.delete(old.id);
      if (this.call) this.call.members = this.call.members.filter(m => m.id !== old.id);
    }
    this.members = members.map(({ id, name }) => ({ id, name })); this.tick(now); this.publish();
  }
  private send(id: string, message: ServerMessage): void { this.peers.get(id)?.(message); }
  private publish(): void {
    for (const id of this.peers.keys()) {
      const own = this.call?.members.find(m => m.id === id);
      const involved = own?.status === 'joined' || own?.status === 'invited';
      this.send(id, { v: 2, type: 'state', groupId: this.groupId, hostId: this.hostId, selfId: id,
        members: this.members.map(m => ({ ...m, online: this.isOnline(m.id) })), busy: !!this.call, call: involved ? this.snapshot : null });
    }
  }
  private error(id: string, code = 'invalid-state', message = 'That action is no longer available.'): void { this.send(id, { v: 2, type: 'error', code, message }); }
  private targetsValid(id: string, targets: string[]): boolean {
    return !targets.includes(id) && targets.every(target => this.members.some(m => m.id === target) && this.isOnline(target));
  }
  private invite(inviter: string, targets: string[], now: number): void {
    if (!this.call) return;
    for (const id of targets) {
      const member: CallMember = { id, status: 'invited', invitationId: randomUUID(), invitedById: inviter, expiresAt: now + 60_000, operationId: null, media: { audio: false, video: false } };
      const index = this.call.members.findIndex(m => m.id === id);
      if (index < 0) this.call.members.push(member); else this.call.members[index] = member;
    }
  }
  private join(id: string, operationId: string, now: number): void {
    if (!this.call) return;
    const own = this.call.members.find(m => m.id === id)!;
    own.status = 'joined'; own.operationId = operationId; own.expiresAt = null;
    for (const other of this.call.members) if (other.id !== id && other.status === 'joined') {
      const [a, b] = [id, other.id].sort();
      const pair: PeerSnapshot = { id: randomUUID(), a, b, offererId: a, generation: 1, phase: 'connecting' };
      this.call.pairs.push(pair); this.negotiations.set(pair.id, { deadline: now + 30_000, offered: false, answered: false, restarted: false, connected: new Set() });
      this.hadTwo = true;
    }
  }
  private leave(id: string, reason: EndReason): void {
    const call = this.call, member = call?.members.find(m => m.id === id);
    if (!call || !member || (member.status !== 'joined' && member.status !== 'invited')) return;
    member.status = 'left'; member.media = { audio: false, video: false }; member.expiresAt = null;
    this.send(id, { v: 2, type: 'ended', callId: call.id, reason });
    for (const p of call.pairs) if (p.a === id || p.b === id) this.negotiations.delete(p.id);
    call.pairs = call.pairs.filter(p => p.a !== id && p.b !== id);
    this.finishIfEmpty(reason);
  }
  private finishIfEmpty(reason: EndReason): void {
    const call = this.call; if (!call) return;
    const joined = call.members.filter(m => m.status === 'joined').length;
    if (this.hadTwo ? joined < 2 : joined === 0 || !call.members.some(m => m.status === 'invited')) this.end(reason);
  }
  receive(id: string, value: ClientMessage, now: number): void {
    if (!this.isOnline(id)) return;
    const message = parseClientMessage(value); if (!message) { this.error(id, 'invalid-message', 'Update all group members to the current ZoomTime version.'); return; }
    this.tick(now);
    if (message.type === 'sync') { this.publish(); return; }
    if (message.type === 'request') {
      if (!this.targetsValid(id, message.targetIds)) { this.error(id, 'peer-unavailable', 'Select available named members. Everyone must have ZoomTime and Tailscale open.'); return; }
      if (this.call) {
        const desired = [...message.targetIds, id].sort();
        const current = this.call.members.filter(m => m.status === 'joined' || m.status === 'invited').map(m => m.id).sort();
        const own = this.call.members.find(m => m.id === id);
        if (own?.status !== 'invited' || JSON.stringify(desired) !== JSON.stringify(current)) { this.error(id, 'busy', 'A call is already active. Ask a participant to invite you.'); return; }
        this.join(id, message.operationId, now);
      } else {
        this.call = { id: randomUUID(), callerId: id, members: [{ id, status: 'joined', invitationId: null, invitedById: null, expiresAt: null, operationId: message.operationId, media: { audio: false, video: false } }], pairs: [] };
        this.hadTwo = false; this.negotiations.clear(); this.invite(id, message.targetIds, now);
      }
      this.publish(); return;
    }
    const call = this.call;
    if (!call || call.id !== message.callId) { this.error(id, 'stale-call', 'This call has ended.'); return; }
    const own = call.members.find(m => m.id === id);
    if (message.type === 'accept' || message.type === 'reject') {
      if (own?.status !== 'invited' || own.invitationId !== message.invitationId) { this.error(id, 'stale-invitation', 'This invitation has expired. Ask for a fresh invitation.'); return; }
      if (message.type === 'accept') this.join(id, message.operationId, now);
      else { own.status = 'declined'; own.expiresAt = null; this.finishIfEmpty('rejected'); }
      this.publish(); return;
    }
    if (own?.status !== 'joined') { this.error(id); return; }
    if (message.type === 'invite') {
      if (!this.targetsValid(id, message.targetIds) || message.targetIds.some(target => call.members.some(m => m.id === target && (m.status === 'joined' || m.status === 'invited')))) { this.error(id, 'peer-unavailable', 'Select available members who are not already joined or invited.'); return; }
      this.invite(id, message.targetIds, now); this.publish(); return;
    }
    if (message.type === 'hangup' || message.type === 'cancel') {
      if (message.type === 'cancel' && (call.callerId !== id || this.hadTwo)) { this.error(id); return; }
      this.leave(id, message.type === 'cancel' ? 'cancelled' : 'hangup'); this.publish(); return;
    }
    if (message.type === 'media') { own.media = { audio: message.audio, video: message.video }; this.publish(); return; }
    if (!('pairId' in message)) { this.error(id); return; }
    const pair = call.pairs.find(p => p.id === message.pairId && (p.a === id || p.b === id));
    if (!pair || pair.generation !== message.generation) { this.error(id, 'stale-generation', 'Ignored an obsolete negotiation.'); return; }
    const state = this.negotiations.get(pair.id)!;
    const other = pair.a === id ? pair.b : pair.a;
    if (message.type === 'recover') {
      if (pair.phase === 'failed') return;
      if (!state.restarted && this.isOnline(pair.a) && this.isOnline(pair.b)) {
        state.restarted = true; pair.generation++; state.connected.clear(); state.offered = false; state.answered = false;
      }
      pair.phase = 'reconnecting'; state.deadline ??= now + 30_000; this.publish(); return;
    }
    if (message.type === 'failed') { pair.phase = 'failed'; state.deadline = null; this.finishFailed(); this.publish(); return; }
    if (pair.phase === 'failed') { this.error(id); return; }
    if (message.type === 'connected') {
      if (!state.answered || state.connected.has(id)) return;
      state.connected.add(id);
      if (state.connected.size === 2) { pair.phase = 'connected'; state.deadline = null; state.restarted = false; }
      this.publish(); return;
    }
    if (message.type === 'description') {
      if (message.description.type === 'offer' && id === pair.offererId && !state.offered) state.offered = true;
      else if (message.description.type === 'answer' && id !== pair.offererId && state.offered && !state.answered) state.answered = true;
      else { this.error(id); return; }
    }
    if (message.type === 'description' || message.type === 'ice') this.send(other, { ...message, fromId: id });
  }
  private finishFailed(): void {
    if (this.call?.pairs.length && this.call.pairs.every(p => p.phase === 'failed') && !this.call.members.some(m => m.status === 'invited')) this.end('connect-timeout');
  }
  tick(now: number): void {
    let changed = false;
    for (const [id, deadline] of this.disconnected) if (now >= deadline) {
      this.disconnected.delete(id);
      if (id === this.hostId) this.end('recovery-timeout'); else this.leave(id, 'peer-left'); changed = true;
    }
    for (const member of this.call?.members ?? []) if (member.status === 'invited' && member.expiresAt !== null && now >= member.expiresAt) {
      member.status = 'expired'; member.expiresAt = null; changed = true;
      this.send(member.id, { v: 2, type: 'ended', callId: this.call!.id, reason: 'ring-timeout' });
    }
    this.finishIfEmpty('ring-timeout');
    for (const pair of this.call?.pairs ?? []) {
      const state = this.negotiations.get(pair.id)!;
      if (state.deadline !== null && now >= state.deadline) { pair.phase = 'failed'; state.deadline = null; changed = true; }
    }
    this.finishFailed(); if (changed) this.publish();
  }
  end(reason: EndReason): void {
    const call = this.call; if (!call) return;
    this.call = null; this.negotiations.clear(); this.hadTwo = false;
    for (const m of call.members) if (m.status === 'joined' || m.status === 'invited') this.send(m.id, { v: 2, type: 'ended', callId: call.id, reason });
    this.publish();
  }
}
