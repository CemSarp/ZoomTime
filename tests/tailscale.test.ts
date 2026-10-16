import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectTailscale, setupTailscaleHost } from '../src/tailscale.ts';
const status = JSON.stringify({ BackendState: 'Running', Self: { Online: true, DNSName: 'my-mac.tail123.ts.net.' }, CertDomains: ['my-mac.tail123.ts.net'] });
const own = { TCP: { '8443': { HTTPS: true } }, Web: { 'my-mac.tail123.ts.net:8443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:47831' } } } } };

test('host setup derives endpoint and configures only its free private port', async () => {
  const commands: string[][] = [];
  let configured = false;
  const endpoint = await setupTailscaleHost(async args => {
    commands.push(args);
    if (args[0] === 'status') return status;
    if (args[0] === 'serve' && args[1] === 'status') return JSON.stringify(configured ? own : {});
    assert.deepEqual(args, ['serve', '--bg', '--https=8443', 'http://127.0.0.1:47831']); configured = true; return '';
  });
  assert.equal(endpoint, 'wss://my-mac.tail123.ts.net:8443/zoomtime');
  assert.equal(commands.filter(args => args.includes('--bg')).length, 1);
});
test('existing owned endpoint is reused without mutations', async () => {
  await setupTailscaleHost(async args => { if (args[0] === 'status') return status; assert.deepEqual(args, ['serve', 'status', '--json']); return JSON.stringify(own); });
});
test('conflicts, stale hostnames, and Funnel are refused before mutation', async () => {
  for (const config of [
    { ...own, TCP: { '8443': { TCPForward: 'localhost:1234' } } },
    { ...own, Web: { 'old.tail123.ts.net:8443': Object.values(own.Web)[0] } },
    { ...own, AllowFunnel: { 'my-mac.tail123.ts.net:8443': true } },
    { ...own, Web: { 'my-mac.tail123.ts.net:8443': { Handlers: { '/': { Proxy: 'http://localhost:9999' } } } } },
  ]) await assert.rejects(setupTailscaleHost(async args => { if (args[0] === 'status') return status; assert.deepEqual(args, ['serve', 'status', '--json']); return JSON.stringify(config); }), /8443|hostname|Funnel/);
});
test('offline, invalid hostname, and missing HTTPS approval return actionable failures', async () => {
  for (const result of [{ BackendState: 'Stopped' }, { BackendState: 'Running', Self: { Online: true, DNSName: 'evil.example.org' } }, { BackendState: 'Running', Self: { Online: true, DNSName: 'my-mac.tail123.ts.net.' }, CertDomains: [] }]) {
    await assert.rejects(setupTailscaleHost(async args => { assert.deepEqual(args, ['status', '--json']); return JSON.stringify(result); }), /Tailscale|HTTPS/);
  }
});

test('other private services are preserved and a concurrent change is refused', async () => {
  const other = { TCP: { '443': { HTTPS: true } }, Web: { 'my-mac.tail123.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9000' } } } } };
  let mutated = false;
  await setupTailscaleHost(async args => {
    if (args[0] === 'status') return status;
    if (args.includes('--bg')) { assert.deepEqual(args, ['serve', '--bg', '--https=8443', 'http://127.0.0.1:47831']); mutated = true; return ''; }
    return JSON.stringify(mutated ? { TCP: { ...other.TCP, ...own.TCP }, Web: { ...other.Web, ...own.Web } } : other);
  });
  let reads = 0;
  await assert.rejects(setupTailscaleHost(async args => {
    if (args[0] === 'status') return status;
    assert.deepEqual(args, ['serve', 'status', '--json']);
    return JSON.stringify(++reads === 1 ? {} : other);
  }), /changed/);
  await assert.rejects(setupTailscaleHost(async args => args[0] === 'status' ? status : JSON.stringify({ Foreground: { example: own } })), /foreground/);
});

test('guest pairing tolerates non-JSON or unavailable CLI status without running Serve', async () => {
  for (const command of [
    async (_args: string[]) => 'The Tailscale command-line interface is unavailable.',
    async (_args: string[]) => 'null',
    async (_args: string[]) => '[]',
    async (_args: string[]) => { throw new Error('CLI unavailable'); },
  ]) {
    const commands: string[][] = [];
    await connectTailscale(async args => { commands.push(args); return command(args); }, false);
    assert.deepEqual(commands, [['status', '--json']], 'Unsupported guest CLI must not configure Serve or execute further commands');
  }
});
test('hosting rejects non-JSON CLI status with a redacted actionable error', async () => {
  await assert.rejects(connectTailscale(async () => 'The Tailscale CLI failed: PRIVATE_DIAGNOSTIC', true), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /Tailscale|command-line/);
    assert.doesNotMatch(error.message, /SyntaxError|Unexpected token|PRIVATE_DIAGNOSTIC/); return true;
  });
});
test('supported host and guest CLI paths retain automatic connection of a stopped session', async () => {
  for (const required of [true, false]) {
    const commands: string[][] = []; let connected = false;
    await connectTailscale(async args => {
      commands.push(args);
      if (args[0] === 'up') { connected = true; return ''; }
      return connected ? status : JSON.stringify({ BackendState: 'Stopped' });
    }, required);
    assert.deepEqual(commands, [['status', '--json'], ['up', '--timeout=15s'], ['status', '--json']]);
  }
});
