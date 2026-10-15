import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, selectUpdate } from '../src/updates.ts';
const asset = (version: string, arch = 'arm64') => ({ name: `ZoomTime-darwin-${arch}-${version}.zip`,
  browser_download_url: `https://github.com/CemSarp/ZoomTime/releases/download/v${version}/ZoomTime-darwin-${arch}-${version}.zip`,
  digest: 'sha256:' + 'a'.repeat(64), size: 130_000_000, state: 'uploaded' });
const release = (version: string, extra: Record<string, unknown> = {}) => ({ tag_name: `v${version}`, draft: false, prerelease: true,
  assets: [asset(version), asset(version, 'x64')], ...extra });
test('numeric versions never install an older GitHub build', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.3.1', '0.3.1'), 0);
  assert.equal(compareVersions('0.2.0', '0.3.1'), -1);
  assert.throws(() => compareVersions('0.3.bad', '0.3.1'));
  assert.equal(selectUpdate([release('0.2.0')], '0.3.1', 'arm64').available, false);
});
test('latest published private prerelease is selected by version and correct Mac architecture', () => {
  const selected = selectUpdate([release('0.9.0'), release('0.10.0'), release('9.0.0', { draft: true })], '0.3.1', 'x64');
  assert.equal(selected.available, true); assert.equal(selected.release?.version, '0.10.0');
  assert.equal(selected.release?.name, 'ZoomTime-darwin-x64-0.10.0.zip');
  assert.equal(selected.release?.prerelease, true);
});
test('untrusted or incomplete release metadata cannot supply executable downloads', () => {
  for (const overrides of [
    { browser_download_url: 'https://evil.example/app.zip' },
    { browser_download_url: 'http://github.com/CemSarp/ZoomTime/releases/download/v0.4.0/ZoomTime-darwin-arm64-0.4.0.zip' },
    { digest: null }, { digest: 'sha256:bad' }, { size: 0 }, { size: 900_000_000 }, { state: 'new' },
  ]) assert.throws(() => selectUpdate([release('0.4.0', { assets: [{ ...asset('0.4.0'), ...overrides }] })], '0.3.1', 'arm64'));
  assert.throws(() => selectUpdate([release('0.4.0', { assets: [asset('0.4.0', 'x64')] })], '0.3.1', 'arm64'));
  assert.throws(() => selectUpdate({}, '0.3.1', 'arm64'));
});

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { allowedDownloadUrl, fetchReleases, saveUpdate, Updates, verifyArchive, type UpdateRelease, type UpdateState } from '../src/updates.ts';
const fixture = (data: Buffer): UpdateRelease => ({ version: '0.4.0', name: 'ZoomTime-darwin-arm64-0.4.0.zip',
  url: asset('0.4.0').browser_download_url, sha256: createHash('sha256').update(data).digest('hex'), size: data.length, prerelease: true });

test('redirect allowlist retains TLS and the fixed publisher boundary', () => {
  assert.equal(allowedDownloadUrl(asset('0.4.0').browser_download_url), true);
  assert.equal(allowedDownloadUrl('https://release-assets.githubusercontent.com/asset?signature=test'), true);
  for (const url of ['http://release-assets.githubusercontent.com/asset', 'https://github.com/evil/app/releases/download/test.zip',
    'https://github.com.evil.example/CemSarp/ZoomTime/releases/download/app.zip', 'https://user:pass@github.com/CemSarp/ZoomTime/releases/download/app.zip',
    'https://release-assets.githubusercontent.com:8443/asset', 'file:///tmp/app.zip', 'https://evil.example/asset']) assert.equal(allowedDownloadUrl(url), false);
});
test('GitHub checks fail safely for rate limits, invalid JSON, redirects and oversized metadata', async t => {
  for (const response of [new Response('', { status: 429 }), new Response('not json'),
    new Response(null, { status: 302, headers: { location: 'https://evil.example' } }), new Response('x'.repeat(4 * 1024 * 1024 + 1))]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(fetchReleases());
    t.mock.restoreAll();
  }
});
test('failed checks are actionable and can be retried without exposing transport details', async () => {
  let attempts = 0;
  const updates = new Updates('0.3.1', 'arm64', '', () => {}, async () => {
    if (!attempts++) throw new TypeError('internal transport information');
    return [release('0.4.0')];
  });
  await updates.check();
  assert.equal(updates.state.status, 'error'); assert.doesNotMatch(updates.state.message, /internal/);
  await updates.check();
  assert.equal(updates.state.status, 'available');
});
test('checks and downloads are serialized, explicit, and do not expose URL, digest or file paths to the UI', async () => {
  let finish!: (value: unknown) => void, finishSave!: (value: string) => void, loads = 0, saves = 0;
  const states: UpdateState[] = [];
  const updates = new Updates('0.3.1', 'arm64', '/private/downloads', state => states.push(state), () => {
    loads++; return new Promise(resolve => { finish = resolve; });
  }, (_release, _directory, progress) => { saves++; progress(50); return new Promise(resolve => { finishSave = resolve; }); });
  assert.equal(loads, 0); await updates.download(); assert.equal(saves, 0);
  await assert.rejects(updates.verifiedPath());
  const checking = updates.check(); await updates.check(); await updates.download(); assert.equal(loads, 1); assert.equal(saves, 0);
  finish([release('0.4.0')]); await checking;
  const downloading = updates.download(); await updates.download(); await updates.check(); finishSave('/private/downloads/test.zip'); await downloading;
  assert.equal(saves, 1); assert.equal(loads, 1); assert.equal(updates.state.status, 'ready');
  assert.ok(states.some(state => state.percent === 50));
  assert.doesNotMatch(JSON.stringify(states), /private\/downloads|browser_download_url|sha256|https:\/\//);
});
test('download errors cannot leave an installable state and require a fresh check', async () => {
  const updates = new Updates('0.3.1', 'arm64', '', () => {}, async () => [release('0.4.0')], async () => { throw new Error('Checksum mismatch'); });
  await updates.check(); await updates.download();
  assert.equal(updates.state.status, 'error'); await assert.rejects(updates.verifiedPath());
  await updates.download(); assert.equal(updates.state.status, 'error');
  await updates.check(); assert.equal(updates.state.status, 'available');
});
test('archive verification rejects truncation and changed bytes', async () => {
  const data = Buffer.from('harmless archive fixture'), path = join(await mkdtemp(join(tmpdir(), 'zoomtime-hash-')), 'fixture.zip');
  await writeFile(path, data); await verifyArchive(path, fixture(data));
  await writeFile(path, Buffer.alloc(data.length)); await assert.rejects(verifyArchive(path, fixture(data)), /checksum/);
  await writeFile(path, 'short'); await assert.rejects(verifyArchive(path, fixture(data)), /incomplete/);
});
test('downloads follow only trusted HTTPS redirects, verify bytes, preserve quarantine and recheck before Finder', { skip: process.platform !== 'darwin' }, async t => {
  const data = Buffer.from('harmless download fixture, not executable'), selected = fixture(data);
  const directory = await mkdtemp(join(tmpdir(), 'zoomtime-updates-'));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(options?.redirect, 'manual'); assert.ok(options?.signal);
    requests++;
    if (url === selected.url) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/test' } });
    assert.equal(url, 'https://release-assets.githubusercontent.com/test');
    return new Response(data);
  });
  const states: UpdateState[] = [];
  const updates = new Updates('0.3.1', 'arm64', directory, state => states.push(state), async () => [{ ...release('0.4.0'), assets: [{ ...asset('0.4.0'), size: data.length, digest: 'sha256:' + selected.sha256 }] }]);
  await updates.check(); await updates.download();
  assert.equal(updates.state.status, 'ready'); assert.equal(requests, 2);
  const revealing = updates.verifiedPath();
  await updates.check();
  assert.equal(updates.state.status, 'ready', 'A concurrent check cannot replace the archive while it is being reverified');
  const path = await revealing;
  assert.deepEqual(await readFile(path), data);
  assert.match(execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', path], { encoding: 'utf8' }), /^[0-9a-f]+;/i);
  assert.ok(states.some(state => state.percent === 100));
  await writeFile(path, Buffer.alloc(data.length));
  await assert.rejects(updates.verifiedPath(), /checksum/); assert.equal(updates.state.status, 'error');
});
test('untrusted redirects, excess data, truncated downloads and bad hashes are never offered', { skip: process.platform !== 'darwin' }, async t => {
  const data = Buffer.from('harmless download fixture'), selected = fixture(data);
  const directory = await mkdtemp(join(tmpdir(), 'zoomtime-update-errors-'));
  for (const response of [new Response(null, { status: 302, headers: { location: 'https://evil.example/update.zip' } }),
    new Response(Buffer.alloc(data.length + 1)), new Response('short'), new Response(Buffer.alloc(data.length))]) {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return response; });
    await assert.rejects(saveUpdate(selected, directory, () => {}));
    assert.equal(calls, 1, 'Never follow an untrusted redirect');
    t.mock.restoreAll();
  }
});
