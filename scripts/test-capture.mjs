import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { requireAppleSilicon } from '../src/platform.ts';
requireAppleSilicon(process.arch);
const root = resolve('out', 'verification', 'capture');
mkdirSync(root, { recursive: true });
const run = mkdtempSync(join(root, 'run-'));
execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library', '-O', '-target', 'arm64-apple-macos14.0',
  'native/screen-capture/Pipeline.swift', 'native/screen-capture/Sources.swift', 'native/screen-capture/Tests.swift', '-o', join(run, 'capture-tests')], { stdio: 'inherit' });
const result = execFileSync(join(run, 'capture-tests'), [join(run, 'synthetic.h264')], { encoding: 'utf8' });
writeFileSync(join(run, 'result.json'), result, { mode: 0o600 });
console.log(result.trim());
console.log(`Evidence: ${run}`);
