import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newHostPairing, registerMember, readPairing, writePairing, type SecretCodec } from '../src/pairing.ts';
test('host credentials are separate random 32-byte values', () => {
  const a = registerMember(newHostPairing('wss://mac.tail.ts.net:8443/zoomtime'), 'Partner');
  assert.equal(a.role, 'host'); if (a.role !== 'host') assert.fail();
  assert.equal(Buffer.from(a.members[0].token, 'base64url').length, 32); assert.equal(Buffer.from(a.members[1].token, 'base64url').length, 32);
  assert.notEqual(a.members[0].token, a.members[1].token); assert.notDeepEqual(a, newHostPairing(a.endpoint));
});
test('unavailable or failing Keychain encryption never produces a plaintext fallback', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-pairing-')), 'pairing.bin');
  const codec: SecretCodec = { isEncryptionAvailable: () => false, encryptString: () => assert.fail('must check availability'), decryptString: () => assert.fail() };
  assert.throws(() => writePairing(file, null, codec), /Keychain/);
  assert.throws(() => readFileSync(file), { code: 'ENOENT' });
});
test('pairing persistence uses only codec output and preserves the previous file on encryption failure', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-pairing-')), 'pairing.bin');
  const pairing = newHostPairing('wss://mac.tail.ts.net:8443/zoomtime');
  let encryptedInput = '';
  const codec: SecretCodec = { isEncryptionAvailable: () => true,
    encryptString: value => { encryptedInput = value; return Buffer.from('opaque-test-ciphertext'); }, decryptString: () => encryptedInput };
  writePairing(file, pairing, codec); assert.equal(readFileSync(file, 'utf8'), 'opaque-test-ciphertext');
  assert.equal(statSync(file).mode & 0o777, 0o600); assert.deepEqual(readPairing(file, codec), pairing);
  assert.throws(() => writePairing(file, null, { ...codec, encryptString: () => { throw new Error('locked'); } }), /Keychain/);
  assert.equal(readFileSync(file, 'utf8'), 'opaque-test-ciphertext');
});
