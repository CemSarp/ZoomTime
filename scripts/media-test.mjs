import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url), webpack = require('webpack'), electron = require('electron');
const output = resolve('out/media-tests'); mkdirSync(output, { recursive: true });
await new Promise((done, reject) => webpack({ mode: 'development', devtool: false, target: 'web', entry: resolve('tests/media-browser.ts'),
  output: { path: output, filename: 'renderer.js' }, resolve: { extensions: ['.ts','.js'] },
  module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { noEmit: false, allowImportingTsExtensions: false } } }] } },
  (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : done()));
writeFileSync(resolve(output, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; media-src \'self\' blob:;"><video id="local" muted autoplay></video><video id="remote" muted autoplay></video><script src="renderer.js"></script></html>');
// Generated test devices exercise real getUserMedia permissions without acquiring hardware.
const child = spawn(electron, [resolve('tests/media-main.cjs'), '--use-fake-device-for-media-stream', `--user-data-dir=${mkdtempSync(resolve(tmpdir(),'zoomtime-media-'))}`], { stdio: 'inherit' });
const timer = setTimeout(() => child.kill('SIGTERM'), 165_000);
const code = await new Promise(done => child.on('exit', done)); clearTimeout(timer); process.exitCode = code ?? 1;
