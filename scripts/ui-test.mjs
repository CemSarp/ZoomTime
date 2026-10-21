import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url), webpack = require('webpack'), electron = require('electron');
const output = resolve('out/ui-tests'); mkdirSync(output, { recursive: true });
await new Promise((done, reject) => webpack({ mode: 'development', devtool: false, target: 'web', entry: resolve('tests/ui-browser.ts'),
  output: { path: output, filename: 'renderer.js', publicPath: '' }, resolve: { extensions: ['.ts', '.js'] },
  module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { noEmit: false, allowImportingTsExtensions: false } } }, { test: /\.css$/, type: 'asset/resource', generator: { filename: 'index.css' } }] } },
  (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : done()));
writeFileSync(resolve(output, 'index.html'), readFileSync('src/index.html', 'utf8').replace('</body>', '<script src="renderer.js"></script></body>'));
const child = spawn(electron, [resolve('tests/ui-main.cjs'), '--use-fake-device-for-media-stream', '--mute-audio', `--user-data-dir=${mkdtempSync(resolve(tmpdir(), 'zoomtime-ui-'))}`], { stdio: 'inherit' });
const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
const code = await new Promise(done => child.on('exit', done)); clearTimeout(timer); process.exitCode = code ?? 1;
