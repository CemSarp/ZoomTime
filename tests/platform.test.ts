import test from 'node:test';
import assert from 'node:assert/strict';

test('only native Apple Silicon is supported; Intel and Rosetta are rejected', async () => {
  const platform = await import('../src/platform.ts').catch(() => null);
  assert.ok(platform, 'Apple Silicon platform policy must exist');
  assert.doesNotThrow(() => platform.requireAppleSilicon('arm64'));
  for (const arch of ['x64', 'x86_64', 'universal', 'ia32', '']) {
    assert.throws(() => platform.requireAppleSilicon(arch), /Apple Silicon/);
  }
});
