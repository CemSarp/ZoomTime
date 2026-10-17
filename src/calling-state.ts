import type { CallSnapshot, Member, Role, ServerMessage } from './protocol.ts';
export interface NetworkStatus { state: 'connecting' | 'online' | 'offline' | 'error'; message: string }
export interface CallingState {
  role: Role | null; endpoint: string | null; selfId: string | null; hostId: string | null; groupId: string | null;
  members: Member[]; busy: boolean; network: NetworkStatus; call: CallSnapshot | null; error: string | null;
}
export const emptyCallingState = (): CallingState => ({ role: null, endpoint: null, selfId: null, hostId: null, groupId: null, members: [], busy: false, network: { state: 'offline', message: 'Pair your private group to begin.' }, call: null, error: null });
export type CallingEvent = { type: 'state'; state: CallingState } | { type: 'signal'; message: ServerMessage } | { type: 'stop'; reason: string } | { type: 'check-stop'; reason: string };
export type StartCall = { action: 'call'; targetIds: string[] } | { action: 'accept'; callId: string; invitationId: string };
export type CaptureAction = (StartCall & { operationId: string }) | { action: 'camera' | 'devices'; callId: string };
