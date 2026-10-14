export const MAX_MESSAGE_BYTES = 65_536;
export type Role = 'host' | 'guest';
export type CallPhase = 'ringing' | 'connecting' | 'connected' | 'reconnecting';
export interface MediaStatus { audio: boolean; video: boolean }
export interface CallSnapshot {
  id: string; caller: Role; phase: CallPhase; generation: number;
  media: Record<Role, MediaStatus>;
}
export interface Invitation { app: 'ZoomTime'; v: 1; role: 'guest'; endpoint: string; token: string }
export type EndReason = 'hangup' | 'cancelled' | 'rejected' | 'ring-timeout' | 'connect-timeout' | 'recovery-timeout' | 'peer-left' | 'pairing-reset' | 'sleep' | 'failed';
export type ClientMessage =
  | { v: 1; type: 'request' | 'sync' }
  | { v: 1; type: 'accept' | 'reject' | 'cancel' | 'hangup' | 'recover'; callId: string }
  | { v: 1; type: 'connected'; callId: string; generation: number }
  | { v: 1; type: 'media'; callId: string; audio: boolean; video: boolean }
  | { v: 1; type: 'description'; callId: string; generation: number; description: RTCSessionDescriptionInit }
  | { v: 1; type: 'ice'; callId: string; generation: number; candidate: RTCIceCandidateInit | null };
export type ServerMessage =
  | { v: 1; type: 'state'; role: Role; peerOnline: boolean; call: CallSnapshot | null }
  | Extract<ClientMessage, { type: 'description' | 'ice' }>
  | { v: 1; type: 'ended'; callId: string; reason: EndReason }
  | { v: 1; type: 'error'; code: string; message: string };

export const otherRole = (role: Role): Role => role === 'host' ? 'guest' : 'host';
const role = (value: unknown): value is Role => value === 'host' || value === 'guest';
export const validToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const generation = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
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
  return object(value) && keys(value, ['app', 'v', 'role', 'endpoint', 'token']) && value.app === 'ZoomTime' && value.v === 1 &&
    value.role === 'guest' && approvedEndpoint(value.endpoint) !== null && validToken(value.token) ? value as unknown as Invitation : null;
}
function candidate(value: unknown): boolean {
  return value === null || (object(value) && keys(value, ['candidate'], ['sdpMid', 'sdpMLineIndex', 'usernameFragment']) &&
    typeof value.candidate === 'string' && value.candidate.length <= 4096 &&
    (value.sdpMid === undefined || value.sdpMid === null || (typeof value.sdpMid === 'string' && value.sdpMid.length <= 256)) &&
    (value.sdpMLineIndex === undefined || value.sdpMLineIndex === null || (Number.isSafeInteger(value.sdpMLineIndex) && (value.sdpMLineIndex as number) >= 0 && (value.sdpMLineIndex as number) < 256)) &&
    (value.usernameFragment === undefined || value.usernameFragment === null || (typeof value.usernameFragment === 'string' && value.usernameFragment.length <= 256)));
}
export function parseClientMessage(value: unknown): ClientMessage | null {
  try {
    if (!object(value) || value.v !== 1 || new TextEncoder().encode(JSON.stringify(value)).length > MAX_MESSAGE_BYTES) return null;
    const base = ['v', 'type'];
    if (value.type === 'request' || value.type === 'sync') return keys(value, base) ? value as ClientMessage : null;
    if (!identifier(value.callId)) return null;
    if (['accept', 'reject', 'cancel', 'hangup', 'recover'].includes(value.type as string)) return keys(value, [...base, 'callId']) ? value as ClientMessage : null;
    if (value.type === 'media') return keys(value, [...base, 'callId', 'audio', 'video']) && typeof value.audio === 'boolean' && typeof value.video === 'boolean' ? value as ClientMessage : null;
    if (!generation(value.generation)) return null;
    if (value.type === 'connected') return keys(value, [...base, 'callId', 'generation']) ? value as ClientMessage : null;
    if (value.type === 'ice') return keys(value, [...base, 'callId', 'generation', 'candidate']) && candidate(value.candidate) ? value as ClientMessage : null;
    if (value.type === 'description' && keys(value, [...base, 'callId', 'generation', 'description']) && object(value.description) &&
      keys(value.description, ['type', 'sdp']) && (value.description.type === 'offer' || value.description.type === 'answer') &&
      typeof value.description.sdp === 'string' && value.description.sdp.length > 0 && value.description.sdp.length <= 60_000) return value as ClientMessage;
    return null;
  } catch { return null; }
}
export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!object(value) || value.v !== 1) return null;
  if (value.type === 'description' || value.type === 'ice') return parseClientMessage(value) as ServerMessage | null;
  if (value.type === 'error' && keys(value, ['v', 'type', 'code', 'message']) && typeof value.code === 'string' && value.code.length <= 64 &&
    typeof value.message === 'string' && value.message.length <= 240) return value as ServerMessage;
  if (value.type === 'ended' && keys(value, ['v', 'type', 'callId', 'reason']) && identifier(value.callId) &&
    ['hangup', 'cancelled', 'rejected', 'ring-timeout', 'connect-timeout', 'recovery-timeout', 'peer-left', 'pairing-reset', 'sleep', 'failed'].includes(value.reason as string)) return value as ServerMessage;
  if (value.type !== 'state' || !keys(value, ['v', 'type', 'role', 'peerOnline', 'call']) || !role(value.role) || typeof value.peerOnline !== 'boolean') return null;
  if (value.call === null) return value as ServerMessage;
  const call = value.call;
  const status = (s: unknown) => object(s) && keys(s, ['audio', 'video']) && typeof s.audio === 'boolean' && typeof s.video === 'boolean';
  return object(call) && keys(call, ['id', 'caller', 'phase', 'generation', 'media']) && identifier(call.id) && role(call.caller) &&
    ['ringing', 'connecting', 'connected', 'reconnecting'].includes(call.phase as string) && generation(call.generation) &&
    object(call.media) && keys(call.media, ['host', 'guest']) && status(call.media.host) && status(call.media.guest) ? value as ServerMessage : null;
}
