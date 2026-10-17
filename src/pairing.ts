import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, statSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { approvedEndpoint, identifier, keys, object, parseInvitation, validName, validToken, MAX_MEMBERS, type Invitation } from './protocol.ts';
export interface MemberCredential { id: string; name: string; token: string }
export interface HostPairing { v: 2; role: 'host'; endpoint: string; groupId: string; hostId: string; members: MemberCredential[] }
export type Pairing = HostPairing | Invitation;
export interface SecretCodec { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
export function validateHost(value: unknown): value is HostPairing {
  if (!object(value) || !keys(value, ['v', 'role', 'endpoint', 'groupId', 'hostId', 'members']) || value.v !== 2 || value.role !== 'host' || !approvedEndpoint(value.endpoint) || !identifier(value.groupId) || !identifier(value.hostId) || !Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_MEMBERS) return false;
  const ids = new Set(), tokens = new Set(), names = new Set();
  for (const m of value.members) {
    if (!object(m) || !keys(m, ['id', 'name', 'token']) || !identifier(m.id) || !validName(m.name) || !validToken(m.token) || ids.has(m.id) || tokens.has(m.token) || names.has(m.name.toLowerCase())) return false;
    ids.add(m.id); tokens.add(m.token); names.add(m.name.toLowerCase());
  }
  return ids.has(value.hostId);
}
function validate(value: unknown): Pairing | null {
  if (value === null) return null;
  if (validateHost(value) || parseInvitation(value)) return value as Pairing;
  throw new Error('Invalid encrypted pairing');
}
const storageError = () => new Error('macOS Keychain could not securely save or unlock pairing. Unlock Keychain and retry, or explicitly reset pairing.');
export function newHostPairing(endpoint: string): HostPairing {
  if (!approvedEndpoint(endpoint)) throw new Error('Use your private wss://hostname.ts.net:8443/zoomtime endpoint.');
  const hostId = randomUUID();
  return { v: 2, role: 'host', endpoint, groupId: randomUUID(), hostId, members: [{ id: hostId, name: 'Host', token: randomBytes(32).toString('base64url') }] };
}
function nameFor(host: HostPairing, name: unknown, except?: string): string {
  const cleaned = typeof name === 'string' ? name.trim().normalize('NFC') : '';
  if (!validName(cleaned) || host.members.some(m => m.id !== except && m.name.toLowerCase() === cleaned.toLowerCase())) throw new Error('Use a unique name of 1–40 characters without control characters.');
  return cleaned;
}
export function registerMember(host: HostPairing, name: unknown): HostPairing {
  if (host.members.length >= MAX_MEMBERS) throw new Error('This private group supports at most five members, including the host.');
  const member = { id: randomUUID(), name: nameFor(host, name), token: randomBytes(32).toString('base64url') };
  return { ...host, members: [...host.members, member] };
}
export function renameMember(host: HostPairing, id: unknown, name: unknown): HostPairing {
  if (!host.members.some(m => m.id === id)) throw new Error('Unknown group member.');
  const cleaned = nameFor(host, name, id as string);
  return { ...host, members: host.members.map(m => m.id === id ? { ...m, name: cleaned } : m) };
}
export function revokeMember(host: HostPairing, id: unknown): HostPairing {
  if (id === host.hostId || !host.members.some(m => m.id === id)) throw new Error('Only an existing guest can be revoked.');
  return { ...host, members: host.members.filter(m => m.id !== id) };
}
export function readPairing(file: string, codec: SecretCodec): Pairing | null {
  try {
    if (statSync(file).size > 8192 || !codec.isEncryptionAvailable()) throw storageError();
    const ciphertext = readFileSync(file), raw: unknown = JSON.parse(codec.decryptString(ciphertext));
    if (object(raw) && keys(raw, ['v', 'role', 'endpoint', 'hostToken', 'guestToken']) && raw.v === 1 && raw.role === 'host' && approvedEndpoint(raw.endpoint) && validToken(raw.hostToken) && validToken(raw.guestToken) && raw.hostToken !== raw.guestToken) {
      const migrated = newHostPairing(raw.endpoint as string);
      migrated.members[0].token = raw.hostToken;
      migrated.members.push({ id: randomUUID(), name: 'Partner', token: raw.guestToken });
      writeFileSync(`${file}.v1-backup-${randomUUID()}.bin`, ciphertext, { flag: 'wx', mode: 0o600 });
      writePairing(file, migrated, codec); return migrated;
    }
    return validate(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw storageError();
  }
}
export function writePairing(file: string, value: Pairing | null, codec: SecretCodec): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    if (!codec.isEncryptionAvailable()) throw storageError();
    const encrypted = codec.encryptString(JSON.stringify(validate(value)));
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 }); renameSync(temporary, file);
  } catch {
    try { unlinkSync(temporary); } catch { /* Only remove this attempted write's temporary file. */ }
    throw storageError();
  }
}
export function identifyGuest(file: string, legacy: Invitation, identity: { groupId: string; hostId: string; selfId: string }, codec: SecretCodec): Invitation {
  if (legacy.v !== 1) return legacy;
  const next: Invitation = { ...legacy, v: 2, groupId: identity.groupId, hostId: identity.hostId, participantId: identity.selfId };
  if (!parseInvitation(next) || !codec.isEncryptionAvailable()) throw storageError();
  writeFileSync(`${file}.v1-backup-${randomUUID()}.bin`, readFileSync(file), { flag: 'wx', mode: 0o600 });
  writePairing(file, next, codec); return next;
}
