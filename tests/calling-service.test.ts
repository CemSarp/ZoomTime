import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CallingService } from '../src/calling-service.ts';
import { SignalingClient } from '../src/signaling-client.ts';
const unavailable = { isEncryptionAvailable: () => false, encryptString: () => assert.fail(), decryptString: () => assert.fail() };
test('unpaired apps cannot authorize capture or send call messages', async () => {
  const service = new CallingService(join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin'), unavailable, () => {});
  await service.initialize(); assert.equal(service.state.role, null); assert.equal(service.captureAllowed, false);
  assert.throws(() => service.authorizeCapture('call')); assert.throws(() => service.authorizeCapture('anything'));
  assert.throws(() => service.send({ v: 1, type: 'request' })); assert.throws(() => service.invitation());
  await service.shutdown();
});
test('reset revokes the old guest and retry failure releases authorized capture', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin');
  let stored = '', locked = false;
  const codec = { isEncryptionAvailable: () => !locked, encryptString: (value: string) => { stored = value; return Buffer.from('test ciphertext'); }, decryptString: () => stored };
  const events: { type: string }[] = [];
  const service = new CallingService(file, codec, event => events.push(event));
  const wait = async (predicate: () => boolean) => { const end = Date.now() + 2500; while (!predicate()) { assert.ok(Date.now() < end); await new Promise(r => setTimeout(r, 10)); } };
  let guest: SignalingClient | null = null;
  try {
    await service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    const invitation = JSON.parse(service.invitation());
    guest = new SignalingClient('ws://127.0.0.1:47831/zoomtime', invitation.token, () => {}, () => {}); guest.start();
    await wait(() => service.state.peerOnline && service.state.network.state === 'online');
    service.authorizeDeviceCheck(); service.authorizeCapture('call');
    assert.equal(service.deviceCheckAllowed, false); assert.ok(events.some(e => e.type === 'check-stop'));
    service.send({ v: 1, type: 'request' }); await wait(() => service.state.call !== null);
    assert.throws(() => service.authorizeDeviceCheck(), /End/);
    locked = true; await assert.rejects(service.retry(), /Keychain/);
    assert.equal(service.captureAllowed, false); assert.equal(service.state.call, null); assert.ok(events.some(e => e.type === 'stop'));
    locked = false; await service.reset(); assert.equal(service.state.role, null);
    guest.stop(); await service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    assert.notEqual(JSON.parse(service.invitation()).token, invitation.token);
    let rejected = false;
    guest = new SignalingClient('ws://127.0.0.1:47831/zoomtime', invitation.token, () => {}, status => { rejected ||= status.state === 'error'; }); guest.start();
    await wait(() => rejected); assert.equal(service.state.peerOnline, false);
  } finally { guest?.stop(); await service.shutdown(); }
});
test('failed secure pairing leaves the app unpaired and writes no secret', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin');
  const service = new CallingService(file, unavailable, () => {});
  await assert.rejects(service.createHost('wss://mac.tail.ts.net:8443/zoomtime'), /Keychain/);
  assert.equal(service.state.role, null); assert.throws(() => readFileSync(file), { code: 'ENOENT' });
  await assert.rejects(service.importInvitation('{bad'), /invitation/i);
  await service.shutdown();
});
test('reset during host startup cannot leave the revoked server listening', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin'); let text = '';
  const codec = { isEncryptionAvailable: () => true, encryptString: (value: string) => { text = value; return Buffer.from('ciphertext'); }, decryptString: () => text };
  const service = new CallingService(file, codec, () => {});
  try {
    const starting = service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    await service.reset(); await starting;
    assert.equal(service.state.role, null);
    await assert.rejects(fetch('http://127.0.0.1:47831/', { signal: AbortSignal.timeout(1000) }));
  } finally { await service.shutdown(); }
});
test('failed pairing reset still withdraws capture authorization and stops private listening', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin'); let stored='', locked=false;
  const codec={isEncryptionAvailable:()=>!locked,encryptString:(text:string)=>{stored=text;return Buffer.from('ciphertext');},decryptString:()=>stored};
  const service=new CallingService(file,codec,()=>{}); let guest:SignalingClient|null=null;
  try {
    await service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    guest=new SignalingClient('ws://127.0.0.1:47831/zoomtime',JSON.parse(service.invitation()).token,()=>{},()=>{}); guest.start();
    const end=Date.now()+2000;while(!service.state.peerOnline){assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,10));}
    service.authorizeCapture('call'); locked=true;
    await assert.rejects(service.reset(),/Keychain/); assert.equal(service.captureAllowed,false);
    await assert.rejects(fetch('http://127.0.0.1:47831/',{signal:AbortSignal.timeout(1000)}));
  } finally {guest?.stop();await service.shutdown();}
});
test('a delayed acceptance cannot revive a call after capture authorization is withdrawn', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin'); let stored = '';
  const codec = { isEncryptionAvailable: () => true, encryptString: (text: string) => { stored = text; return Buffer.from('ciphertext'); }, decryptString: () => stored };
  const service = new CallingService(file, codec, () => {}); let guest: SignalingClient | null = null;
  const wait = async (predicate: () => boolean) => { const end = Date.now() + 2000; while (!predicate()) { assert.ok(Date.now() < end); await new Promise(r => setTimeout(r, 10)); } };
  try {
    await service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    guest = new SignalingClient('ws://127.0.0.1:47831/zoomtime', JSON.parse(service.invitation()).token, () => {}, () => {}); guest.start();
    await wait(() => service.state.peerOnline);
    service.authorizeCapture('call'); service.send({ v: 1, type: 'request' }); await wait(() => service.state.call !== null);
    const callId = service.state.call!.id;
    service.releaseCapture(); guest.send({ v: 1, type: 'accept', callId });
    await wait(() => service.state.call?.phase !== 'ringing');
    assert.equal(service.state.call, null, 'A late state snapshot must not resume a session whose capture was cancelled');
  } finally { guest?.stop(); await service.shutdown(); }
});
test('renderer reload and repeated OS interrupts immediately notify the peer and withdraw capture', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'zoomtime-service-')), 'pairing.bin'); let stored = '';
  const codec = { isEncryptionAvailable: () => true, encryptString: (text: string) => { stored = text; return Buffer.from('ciphertext'); }, decryptString: () => stored };
  const service = new CallingService(file, codec, () => {}); let guest: SignalingClient | null = null, ended = 0;
  const wait = async (predicate: () => boolean) => { const end = Date.now() + 2000; while (!predicate()) { assert.ok(Date.now() < end); await new Promise(r => setTimeout(r, 10)); } };
  try {
    await service.createHost('wss://mac.tail.ts.net:8443/zoomtime');
    guest = new SignalingClient('ws://127.0.0.1:47831/zoomtime', JSON.parse(service.invitation()).token, message => { if (message.type === 'ended') ended++; }, () => {}); guest.start();
    await wait(() => service.state.peerOnline);
    service.authorizeCapture('call'); service.send({ v: 1, type: 'request' }); await wait(() => service.state.call !== null);
    service.interrupt('App view reloaded'); service.interrupt('Mac woke up');
    assert.equal(service.state.call, null); assert.equal(service.captureAllowed, false);
    await wait(() => ended > 0); assert.equal(ended, 1);
  } finally { guest?.stop(); await service.shutdown(); }
});

test('a local device-check lease cannot authorize signaling and stops idempotently', async () => {
  const events: { type: string }[] = [];
  const service = new CallingService(join(mkdtempSync(join(tmpdir(), 'zoomtime-check-')), 'pairing.bin'), unavailable, event => events.push(event));
  try {
    service.authorizeDeviceCheck();
    assert.equal(service.deviceCheckAllowed, true);
    assert.equal(service.captureAllowed, false);
    assert.throws(() => service.authorizeDeviceCheck());
    assert.throws(() => service.authorizeCapture('call'));
    assert.throws(() => service.send({ v: 1, type: 'request' }));
    service.endDeviceCheck('Stopped'); service.endDeviceCheck('Stopped again');
    assert.equal(service.deviceCheckAllowed, false);
    assert.equal(events.filter(e => e.type === 'check-stop').length, 1);
    service.authorizeDeviceCheck(); await service.shutdown();
    assert.equal(service.deviceCheckAllowed, false);
  } finally { await service.shutdown(); }
});
test('device-check permission expires after two minutes', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const service = new CallingService(join(mkdtempSync(join(tmpdir(), 'zoomtime-check-')), 'pairing.bin'), unavailable, () => {});
  try {
    service.authorizeDeviceCheck(); context.mock.timers.tick(119_999);
    assert.equal(service.deviceCheckAllowed, true);
    context.mock.timers.tick(1);
    assert.equal(service.deviceCheckAllowed, false);
    assert.equal(service.captureAllowed, false);
  } finally { await service.shutdown(); }
});
