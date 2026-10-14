import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, statSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { approvedEndpoint, parseInvitation, validToken, type Invitation } from './protocol.ts';
export type Pairing = { v: 1; role: 'host'; endpoint: string; hostToken: string; guestToken: string } | Invitation;
export interface SecretCodec { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
function validate(value: unknown): Pairing | null {
  if (value === null) return null;
  if (parseInvitation(value)) return value as Invitation;
  const p = value as Record<string, unknown>;
  if (p && p.v === 1 && p.role === 'host' && Object.keys(p).length === 5 && approvedEndpoint(p.endpoint) &&
    validToken(p.hostToken) && validToken(p.guestToken) && p.hostToken !== p.guestToken) return p as Pairing;
  throw new Error('Invalid encrypted pairing');
}
const storageError = () => new Error('macOS Keychain could not securely save or unlock pairing. Unlock Keychain and retry, or explicitly reset pairing.');
export function newHostPairing(endpoint: string): Pairing {
  if (!approvedEndpoint(endpoint)) throw new Error('Use your private wss://hostname.ts.net:8443/zoomtime endpoint.');
  return { v: 1, role: 'host', endpoint, hostToken: randomBytes(32).toString('base64url'), guestToken: randomBytes(32).toString('base64url') };
}
export function readPairing(file: string, codec: SecretCodec): Pairing | null {
  try {
    const size = statSync(file).size;
    if (size > 8192 || !codec.isEncryptionAvailable()) throw storageError();
    return validate(JSON.parse(codec.decryptString(readFileSync(file))));
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
