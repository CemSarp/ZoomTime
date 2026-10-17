import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CallingService } from '../src/calling-service.ts';

test('calling-service tests use an ephemeral port without touching an occupied production port', async () => {
  const sentinel = createServer();
  await new Promise<void>((resolve, reject) => {
    sentinel.once('error', (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE' ? resolve() : reject(error));
    sentinel.listen(47831, '127.0.0.1', resolve);
  });
  let stored = '';
  const codec = { isEncryptionAvailable: () => true, encryptString: (value: string) => { stored = value; return Buffer.from('ciphertext'); }, decryptString: () => stored };
  const service = new CallingService(join(mkdtempSync(join(tmpdir(), 'zoomtime-isolation-')), 'pairing.bin'), codec, () => {}, 0);
  try {
    await service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    assert.ok(service.localPort && service.localPort !== 47831, 'The test host must bind its own ephemeral port');
    assert.equal((await fetch(`http://127.0.0.1:${service.localPort}/`)).status, 404);
  } finally {
    await service.shutdown();
    if (sentinel.listening) await new Promise<void>(resolve => sentinel.close(() => resolve()));
  }
});
