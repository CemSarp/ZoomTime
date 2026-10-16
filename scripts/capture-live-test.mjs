import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
const binary = resolve('out/native', process.arch, 'ZoomTimeCapture');
const base = resolve('out/verification/capture-live'); mkdirSync(base, { recursive: true, mode: 0o700 });
const directory = mkdtempSync(join(base, 'run-'));
const fixtureBinary = join(directory, 'capture-fixture');
execFileSync('xcrun', ['swiftc', '-parse-as-library', 'native/screen-capture/Fixture.swift', '-o', fixtureBinary]);
const fixture = spawn(fixtureBinary, [], { stdio: 'ignore' });
const results = [];
async function capture(name, selection, change, duration = 5000) {
  const path = join(directory, `${name}.h264`);
  const child = spawn(binary, ['capture', JSON.stringify(selection), path]);
  const events = []; let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  createInterface({input: child.stdout}).on('line', line => events.push(JSON.parse(line)));
  const done = new Promise(resolve => child.once('close', code => resolve(code)));
  await delay(2500);
  if (change) child.stdin.write(JSON.stringify(change) + '\n');
  await delay(duration - 2500); child.stdin.end('stop\n');
  const code = await done;
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({ code, events, stderr }, null, 2), { mode: 0o600 });
  assert.equal(code, 0, JSON.stringify(events));
  assert.ok(events.some(e => e.type === 'statistics' && e.encoder.encoded > 0));
  results.push({name, path, events});
}
try {
  await delay(1000);
  const sources = JSON.parse(execFileSync(binary, ['discover'], {encoding:'utf8'}));
  const windows = sources.windows.filter(w => w.title.startsWith('ZoomTime Capture Fixture'));
  assert.equal(windows.length, 2);
  await capture('windows-move-resize', {kind:'window',ids:windows.map(w => w.id)}, {kind:'window',ids:[4294967295]}, 8000);
  assert.ok(results[0].events.some(e => e.type === 'selection-error'));
  assert.ok(results[0].events.some(e => e.sources?.some(s => s.startsWith('unavailable'))));
  const remaining = windows.find(w => w.title.endsWith('1'));
  await capture('display-and-switch', {kind:'display',ids:[sources.displays[0].id]}, {kind:'window',ids:[remaining.id]});
  writeFileSync(join(directory, 'result.json'), JSON.stringify({os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),results},null,2), {mode:0o600});
  console.log(`Live capture evidence: ${directory}`);
} finally { fixture.kill('SIGTERM'); }
