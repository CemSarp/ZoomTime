import { createHash } from 'node:crypto';
import { createReadStream, globSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const archives = globSync('out/make/zip/darwin/*/*.zip').sort();
if (!archives.length) throw new Error('No archives found; run make:arm64 and/or make:x64 first');
const artifacts = [];
for (const path of archives) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const architecture = path.includes('/arm64/') ? 'arm64' : 'x64';
  artifacts.push({ file: basename(path), path, architecture,
    buildCommand: `npm run make:${architecture}`, sha256: hash.digest('hex') });
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let commit = null;
try { commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Initial uncommitted builds have no revision. */ }
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
mkdirSync('out/distribution', { recursive: true });
writeFileSync('out/distribution/SHA256SUMS', artifacts.map(item => `${item.sha256}  ${item.path}`).join('\n') + '\n');
writeFileSync('out/distribution/build-manifest.json', JSON.stringify({ app: pkg.productName, version: pkg.version,
  builtAt: new Date().toISOString(), source: { commit, dirty }, node: process.version,
  macOS: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
  dependencies: pkg.devDependencies, lockfileSha256: createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
  artifacts, gate: 'Phase 1 window probe. Not a calling app. Both-Mac full-screen tests pending.' }, null, 2) + '\n');
console.log(`Recorded SHA-256 and build metadata for ${artifacts.length} archive(s). Source ${dirty ? 'has uncommitted changes' : 'is clean'}.`);
