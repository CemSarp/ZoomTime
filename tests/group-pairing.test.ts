import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as pairing from '../src/pairing.ts';
const endpoint = 'wss://mac.tail.ts.net:8443/zoomtime';
const token = (letter = 'a') => letter.repeat(42) + 'A';
const codec = () => {
  const values = new Map<string, string>(); let next = 0;
  return { isEncryptionAvailable: () => true, encryptString: (text: string) => { const key = `opaque-${++next}`; values.set(key, text); return Buffer.from(key); }, decryptString: (bytes: Buffer) => { const value = values.get(bytes.toString()); if (!value) throw Error('locked'); return value; } };
};
test('new private group has one stable named host and separate member credentials', () => {
  const host = pairing.newHostPairing(endpoint);
  assert.equal(host.v, 2); assert.equal(host.role, 'host'); if (host.role !== 'host') assert.fail();
  assert.equal(host.members.length, 1); assert.equal(host.members[0].id, host.hostId);
  const added = pairing.registerMember(host, 'Alice');
  assert.equal(host.members.length, 1, 'Changes are immutable until securely saved');
  assert.equal(added.members.length, 2); assert.notEqual(added.members[0].token, added.members[1].token);
  assert.equal(added.groupId, host.groupId);
});
test('member directory enforces five people, safe unique names and unique identities', () => {
  let host = pairing.newHostPairing(endpoint);
  for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) host = pairing.registerMember(host, name);
  assert.equal(host.members.length, 5); assert.throws(() => pairing.registerMember(host, 'Sixth'), /five/i);
  for (const name of ['', '  ', 'A\nB', 'x'.repeat(41)]) assert.throws(() => pairing.renameMember(host, host.hostId, name));
  assert.throws(() => pairing.renameMember(host, host.hostId, ' ALICE '), /name/i);
  const revoked = pairing.revokeMember(host, host.members[1].id);
  assert.equal(revoked.members.length, 4); assert.throws(() => pairing.revokeMember(host, host.hostId));
  assert.throws(() => pairing.writePairing(join(mkdtempSync(join(tmpdir(),'zoomtime-bad-')), 'pairing.bin'), { ...host, members: host.members.map((m, i) => i === 1 ? { ...m, token: host.members[0].token } : m) }, codec()));
});
test('legacy host migrates once, preserving both credentials and an owner-only ciphertext backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-migrate-')), file = join(dir, 'pairing.bin'), store = codec();
  const old = { v: 1, role: 'host', endpoint, hostToken: token(), guestToken: token('b') };
  const original = store.encryptString(JSON.stringify(old)); writeFileSync(file, original);
  const migrated = pairing.readPairing(file, store); assert.ok(migrated?.role === 'host');
  assert.equal(migrated.v, 2); assert.equal(migrated.members[0].token, old.hostToken); assert.equal(migrated.members[1].token, old.guestToken);
  assert.deepEqual(pairing.readPairing(file, store), migrated);
  const backups = readdirSync(dir).filter(name => name.includes('v1-backup'));
  assert.equal(backups.length, 1); assert.deepEqual(readFileSync(join(dir, backups[0])), original);
  assert.equal(statSync(join(dir, backups[0])).mode & 0o777, 0o600);
  assert.ok(!readFileSync(file).includes(Buffer.from(old.hostToken)));
});
test('legacy guest awaits authenticated identity and failed migration leaves original ciphertext', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoomtime-migrate-')), file = join(dir, 'pairing.bin'), store = codec();
  const old = { app: 'ZoomTime', v: 1, role: 'guest', endpoint, token: token() };
  writeFileSync(file, store.encryptString(JSON.stringify(old))); assert.deepEqual(pairing.readPairing(file, store), old);
  const host = { v: 1, role: 'host', endpoint, hostToken: token(), guestToken: token('b') };
  const original = store.encryptString(JSON.stringify(host)); writeFileSync(file, original);
  assert.throws(() => pairing.readPairing(file, { ...store, encryptString: () => { throw Error('locked'); } }), /Keychain/);
  assert.deepEqual(readFileSync(file), original);
});
test('authenticated legacy guest identity upgrade preserves its credential and ciphertext backup', () => {
  const dir=mkdtempSync(join(tmpdir(),'zoomtime-guest-upgrade-')),file=join(dir,'pairing.bin'),store=codec();
  const old={app:'ZoomTime' as const,v:1 as const,role:'guest' as const,endpoint,token:token()},original=store.encryptString(JSON.stringify(old));writeFileSync(file,original);
  const identity={groupId:'00000000-0000-4000-8000-000000000090',hostId:'00000000-0000-4000-8000-000000000001',selfId:'00000000-0000-4000-8000-000000000002'};
  const next=pairing.identifyGuest(file,old,identity,store);assert.equal(next.v,2);assert.equal(next.token,old.token);assert.deepEqual(pairing.readPairing(file,store),next);
  const backup=readdirSync(dir).find(name=>name.includes('v1-backup'))!;assert.deepEqual(readFileSync(join(dir,backup)),original);assert.equal(statSync(join(dir,backup)).mode&0o777,0o600);
});
