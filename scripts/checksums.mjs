import { createHash } from 'node:crypto';
import { createReadStream, globSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const archives = globSync(`out/make/zip/darwin/*/ZoomTime-darwin-*-${pkg.version}.zip`).sort();
if (!archives.length) throw new Error('No archives found; run make:arm64 and/or make:x64 first');
const artifacts = [];
for (const path of archives) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const architecture = path.includes('/arm64/') ? 'arm64' : 'x64';
  artifacts.push({ file: basename(path), path, architecture,
    buildCommand: `npm run make:${architecture}`, sha256: hash.digest('hex') });
}
let commit = null;
try { commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Initial uncommitted builds have no revision. */ }
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
const directory = `out/distribution/${pkg.version}`;
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/SHA256SUMS`, artifacts.map(item => `${item.sha256}  ${item.path}`).join('\n') + '\n');
writeFileSync(`${directory}/build-manifest.json`, JSON.stringify({ app: pkg.productName, version: pkg.version,
  builtAt: new Date().toISOString(), source: { commit, dirty }, node: process.version,
  macOS: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
  dependencies: { ...pkg.dependencies, ...pkg.devDependencies }, lockfileSha256: createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
  artifacts, gate: 'Calling release candidate. Local integration verified; partner Mac, actual two-network and long-call acceptance pending.' }, null, 2) + '\n');
console.log(`Recorded SHA-256 and build metadata for ${artifacts.length} archive(s). Source ${dirty ? 'has uncommitted changes' : 'is clean'}.`);
