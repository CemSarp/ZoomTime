export const MAX_MESSAGE_BYTES = 65_536;
export const MAX_MEMBERS = 5;
export type Role = 'host' | 'guest';
export type ParticipantId = string;
export interface MediaStatus { audio: boolean; video: boolean }
export interface Member { id: ParticipantId; name: string; online: boolean }
export interface CallMember {
  id: ParticipantId; status: 'invited' | 'joined' | 'declined' | 'left' | 'expired';
  invitationId: string | null; invitedById: ParticipantId | null; expiresAt: number | null;
  operationId: string | null; media: MediaStatus;
}
export interface PeerSnapshot {
  id: string; a: ParticipantId; b: ParticipantId; offererId: ParticipantId; generation: number;
  phase: 'connecting' | 'connected' | 'reconnecting' | 'failed';
}
export interface CallSnapshot { id: string; callerId: ParticipantId; members: CallMember[]; pairs: PeerSnapshot[] }
export interface LegacyInvitation { app: 'ZoomTime'; v: 1; role: 'guest'; endpoint: string; token: string }
export interface GroupInvitation { app: 'ZoomTime'; v: 2; role: 'guest'; endpoint: string; token: string; groupId: string; hostId: string; participantId: string }
export type Invitation = LegacyInvitation | GroupInvitation;
export type EndReason = 'hangup' | 'cancelled' | 'rejected' | 'ring-timeout' | 'connect-timeout' | 'recovery-timeout' | 'peer-left' | 'pairing-reset' | 'sleep' | 'failed';
export type ClientMessage =
  | { v: 2; type: 'sync' }
  | { v: 2; type: 'request'; operationId: string; targetIds: ParticipantId[] }
  | { v: 2; type: 'invite'; callId: string; targetIds: ParticipantId[] }
  | { v: 2; type: 'accept'; callId: string; invitationId: string; operationId: string }
  | { v: 2; type: 'reject'; callId: string; invitationId: string }
  | { v: 2; type: 'cancel' | 'hangup'; callId: string }
  | { v: 2; type: 'recover' | 'connected' | 'failed'; callId: string; pairId: string; generation: number }
  | { v: 2; type: 'media'; callId: string; audio: boolean; video: boolean }
  | { v: 2; type: 'description'; callId: string; pairId: string; generation: number; description: RTCSessionDescriptionInit }
  | { v: 2; type: 'ice'; callId: string; pairId: string; generation: number; candidate: RTCIceCandidateInit | null };
export type PairSignal = Extract<ClientMessage, { type: 'description' | 'ice' }>;
export type ServerMessage =
  | { v: 2; type: 'state'; groupId: string; hostId: ParticipantId; selfId: ParticipantId; members: Member[]; busy: boolean; call: CallSnapshot | null }
  | (PairSignal & { fromId: ParticipantId })
  | { v: 2; type: 'ended'; callId: string; reason: EndReason }
  | { v: 2; type: 'error'; code: string; message: string };

export const identifier = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const validToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []): boolean => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
export const validName = (value: unknown): value is string => typeof value === 'string' && value === value.trim().normalize('NFC') && value.length > 0 && value.length <= 40 && !/[\p{Cc}\p{Bidi_Control}]/u.test(value);
export const targetIds = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.length < MAX_MEMBERS && value.every(identifier) && new Set(value).size === value.length;
const generation = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
function bounded(value: unknown): value is Record<string, unknown> {
  try { return object(value) && new TextEncoder().encode(JSON.stringify(value)).length <= MAX_MESSAGE_BYTES; } catch { return false; }
}
export function approvedEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'wss:' || url.port !== '8443' || url.pathname !== '/zoomtime' || url.username || url.password || url.search || url.hash ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(url.hostname) || url.href !== value) return null;
    return url.href;
  } catch { return null; }
}
export function parseInvitation(value: unknown): Invitation | null {
  if (!object(value) || value.app !== 'ZoomTime' || value.role !== 'guest' || !approvedEndpoint(value.endpoint) || !validToken(value.token)) return null;
  const base = ['app', 'v', 'role', 'endpoint', 'token'];
  if (value.v === 1 && keys(value, base)) return value as unknown as LegacyInvitation;
  return value.v === 2 && keys(value, [...base, 'groupId', 'hostId', 'participantId']) && identifier(value.groupId) && identifier(value.hostId) && identifier(value.participantId) && value.hostId !== value.participantId ? value as unknown as GroupInvitation : null;
}
function candidate(value: unknown): boolean {
  return value === null || (object(value) && keys(value, ['candidate'], ['sdpMid', 'sdpMLineIndex', 'usernameFragment']) &&
    typeof value.candidate === 'string' && value.candidate.length <= 4096 &&
    (value.sdpMid === undefined || value.sdpMid === null || (typeof value.sdpMid === 'string' && value.sdpMid.length <= 256)) &&
    (value.sdpMLineIndex === undefined || value.sdpMLineIndex === null || (Number.isSafeInteger(value.sdpMLineIndex) && (value.sdpMLineIndex as number) >= 0 && (value.sdpMLineIndex as number) < 256)) &&
    (value.usernameFragment === undefined || value.usernameFragment === null || (typeof value.usernameFragment === 'string' && value.usernameFragment.length <= 256)));
}
export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!bounded(value) || value.v !== 2) return null;
  const base = ['v', 'type'];
  const valid = (fields: string[], condition = true) => keys(value, [...base, ...fields]) && condition ? value as unknown as ClientMessage : null;
  if (value.type === 'sync') return valid([]);
  if (value.type === 'request') return valid(['operationId', 'targetIds'], identifier(value.operationId) && targetIds(value.targetIds));
  if (!identifier(value.callId)) return null;
  if (value.type === 'invite') return valid(['callId', 'targetIds'], targetIds(value.targetIds));
  if (value.type === 'accept') return valid(['callId', 'invitationId', 'operationId'], identifier(value.invitationId) && identifier(value.operationId));
  if (value.type === 'reject') return valid(['callId', 'invitationId'], identifier(value.invitationId));
  if (value.type === 'cancel' || value.type === 'hangup') return valid(['callId']);
  if (value.type === 'media') return valid(['callId', 'audio', 'video'], typeof value.audio === 'boolean' && typeof value.video === 'boolean');
  if (!identifier(value.pairId) || !generation(value.generation)) return null;
  const pair = ['callId', 'pairId', 'generation'];
  if (value.type === 'connected' || value.type === 'recover' || value.type === 'failed') return valid(pair);
  if (value.type === 'ice') return valid([...pair, 'candidate'], candidate(value.candidate));
  if (value.type === 'description') return valid([...pair, 'description'], object(value.description) && keys(value.description, ['type', 'sdp']) &&
    (value.description.type === 'offer' || value.description.type === 'answer') && typeof value.description.sdp === 'string' && value.description.sdp.length > 0 && value.description.sdp.length <= 60_000);
  return null;
}
// Caller and inviter IDs are historical; revocation removes directory access, not call history.
export function validCall(value: unknown, directory: Member[]): value is CallSnapshot {
  if (!object(value) || !keys(value, ['id', 'callerId', 'members', 'pairs']) || !identifier(value.id) || !identifier(value.callerId) || !Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_MEMBERS || !Array.isArray(value.pairs) || value.pairs.length > 10) return false;
  const ids = new Set(directory.map(m => m.id)), memberIds = new Set<string>();
  for (const member of value.members) {
    if (!object(member) || !keys(member, ['id', 'status', 'invitationId', 'invitedById', 'expiresAt', 'operationId', 'media']) || !identifier(member.id) || !ids.has(member.id) || memberIds.has(member.id) ||
      !['invited', 'joined', 'declined', 'left', 'expired'].includes(String(member.status)) || !(member.invitationId === null || identifier(member.invitationId)) ||
      !(member.invitedById === null || identifier(member.invitedById)) || !(member.operationId === null || identifier(member.operationId)) ||
      !(member.expiresAt === null || Number.isSafeInteger(member.expiresAt) && (member.expiresAt as number) >= 0) ||
      !object(member.media) || !keys(member.media, ['audio', 'video']) || typeof member.media.audio !== 'boolean' || typeof member.media.video !== 'boolean' ||
      member.status === 'invited' && (!identifier(member.invitationId) || !identifier(member.invitedById) || member.expiresAt === null) || member.status === 'joined' && !identifier(member.operationId)) return false;
    memberIds.add(member.id);
  }
  const pairIds = new Set(), endpoints = new Set();
  for (const pair of value.pairs) {
    if (!object(pair) || !keys(pair, ['id', 'a', 'b', 'offererId', 'generation', 'phase']) || !identifier(pair.id) || !identifier(pair.a) || !identifier(pair.b) || pair.a >= pair.b || pair.offererId !== pair.a ||
      !generation(pair.generation) || !['connecting', 'connected', 'reconnecting', 'failed'].includes(String(pair.phase)) || pairIds.has(pair.id) || endpoints.has(`${pair.a}:${pair.b}`) ||
      !value.members.some(m => m.id === pair.a && m.status === 'joined') || !value.members.some(m => m.id === pair.b && m.status === 'joined')) return false;
    pairIds.add(pair.id); endpoints.add(`${pair.a}:${pair.b}`);
  }
  return true;
}
export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!bounded(value) || value.v !== 2) return null;
  if (value.type === 'description' || value.type === 'ice') {
    const { fromId, ...signal } = value;
    return identifier(fromId) && parseClientMessage(signal) ? value as unknown as ServerMessage : null;
  }
  if (value.type === 'error') return keys(value, ['v', 'type', 'code', 'message']) && typeof value.code === 'string' && value.code.length <= 64 && typeof value.message === 'string' && value.message.length <= 240 ? value as unknown as ServerMessage : null;
  if (value.type === 'ended') return keys(value, ['v', 'type', 'callId', 'reason']) && identifier(value.callId) && ['hangup', 'cancelled', 'rejected', 'ring-timeout', 'connect-timeout', 'recovery-timeout', 'peer-left', 'pairing-reset', 'sleep', 'failed'].includes(String(value.reason)) ? value as unknown as ServerMessage : null;
  if (value.type !== 'state' || !keys(value, ['v', 'type', 'groupId', 'hostId', 'selfId', 'members', 'busy', 'call']) || !identifier(value.groupId) || !identifier(value.hostId) || !identifier(value.selfId) || typeof value.busy !== 'boolean' || !Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_MEMBERS) return null;
  const ids = new Set(), names = new Set();
  for (const member of value.members) {
    if (!object(member) || !keys(member, ['id', 'name', 'online']) || !identifier(member.id) || !validName(member.name) || typeof member.online !== 'boolean' || ids.has(member.id) || names.has(member.name.toLowerCase())) return null;
    ids.add(member.id); names.add(member.name.toLowerCase());
  }
  if (!ids.has(value.hostId) || !ids.has(value.selfId) || value.call !== null && (!value.busy || !validCall(value.call, value.members as Member[]) || !value.call.members.some(m => m.id === value.selfId && (m.status === 'invited' || m.status === 'joined')))) return null;
  return value as unknown as ServerMessage;
}
