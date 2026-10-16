import { createWriteStream } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { openPromise } from 'yauzl';
import { quarantineArchive, selectUpdate, verifyArchive, type UpdateRelease } from './updates.ts';
const exec = promisify(execFile);
const BUNDLE_ID = 'com.cemsarp.zoomtime';
const unsafeText = (value: string) => [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '\\' || c === ':');
const inside = (root: string, path: string) => { const part = relative(root, path); return part === '' || (!part.startsWith('..' + '/') && part !== '..' && !isAbsolute(part)); };
export function installedApplication(executable: string, home: string): string {
  for (const app of ['/Applications/ZoomTime.app', join(home, 'Applications/ZoomTime.app')]) {
    if (executable === join(app, 'Contents/MacOS/ZoomTime')) return app;
  }
  throw new Error('Move ZoomTime into Applications before installing updates. Apps in Downloads, disk images or translocated locations cannot replace themselves.');
}
async function ownedDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.()) throw new Error('The update location is not a directory owned by this user.');
}
async function absent(path: string): Promise<void> {
  try { await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error('An update destination already exists; no existing files were overwritten.');
}
export async function extractApplication(archive: string, directory: string): Promise<string> {
  await mkdir(directory, { mode: 0o700 });
  const zip = await openPromise(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
  const base = await realpath(directory);
  const app = join(base, 'ZoomTime.app'), names = new Set<string>(), paths: string[] = [], links: { path: string; target: string }[] = [];
  let total = 0, count = 0;
  try {
    if (zip.entryCount > 20_000) throw new Error('The update ZIP has excessive contents.');
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName, components = name.replace(/\/$/, '').split('/');
      total += entry.uncompressedSize;
      if (++count > 20_000 || !Number.isSafeInteger(total) || total > 2 * 1024 ** 3 || entry.isEncrypted() ||
        components[0] !== 'ZoomTime.app' || components.some(p => !p || p === '.' || p === '..') || unsafeText(name)) throw new Error('The update ZIP has unsafe paths, encryption or excessive contents.');
      const canonical = components.join('/').normalize('NFD').toLowerCase();
      if (names.has(canonical)) throw new Error('The update ZIP contains conflicting filenames.');
      names.add(canonical);
      const path = join(base, ...components), mode = entry.externalFileAttributes >>> 16, kind = mode & 0o170000;
      paths.push(path);
      if (kind && ![0o040000, 0o100000, 0o120000].includes(kind)) throw new Error('The update ZIP contains an unsupported file type.');
      if (name.endsWith('/')) { if (kind === 0o120000) throw new Error('Invalid update directory.'); await mkdir(path, { recursive: true, mode: 0o755 }); continue; }
      const stream = await zip.openReadStreamPromise(entry);
      if (kind === 0o120000) {
        if (entry.uncompressedSize > 4096) { stream.destroy(); throw new Error('Oversized update link.'); }
        const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const target = Buffer.concat(chunks).toString('utf8');
        if (!target || unsafeText(target) || isAbsolute(target) || !inside(app, resolve(dirname(path), target))) throw new Error('The update ZIP contains an escaping link.');
        links.push({ path, target });
      } else {
        await mkdir(dirname(path), { recursive: true, mode: 0o755 });
        await pipeline(stream, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
        await chmod(path, mode ? (mode & 0o755) : 0o644);
      }
    }
    // Write links last, so archive data can never be written through a link.
    for (const link of links) {
      if (paths.some(path => path !== link.path && inside(link.path, path))) throw new Error('The update ZIP writes through a symbolic link.');
      await mkdir(dirname(link.path), { recursive: true, mode: 0o755 }); await symlink(link.target, link.path);
    }
    for (const link of links) if (!inside(app, await realpath(link.path))) throw new Error('The update ZIP has an invalid framework link.');
    await ownedDirectory(app); return app;
  } finally { zip.close(); }
}
export async function validateApplication(app: string, version: string, arch: string): Promise<void> {
  if (arch !== 'arm64' && arch !== 'x64') throw new Error('Unsupported Mac architecture.');
  await ownedDirectory(app);
  if (await realpath(app) !== app) throw new Error('A symbolic or translocated app cannot be updated.');
  try {
    const { stdout } = await exec('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], { timeout: 10_000, maxBuffer: 65536 });
    const info = JSON.parse(stdout);
    if (info.CFBundleIdentifier !== BUNDLE_ID || info.CFBundleExecutable !== 'ZoomTime' || info.CFBundleShortVersionString !== version || info.LSMinimumSystemVersion !== '14.0') throw new Error('Wrong app metadata');
    const executable = join(app, 'Contents/MacOS/ZoomTime');
    if (!inside(app, await realpath(executable))) throw new Error('Escaping executable');
    await exec('/usr/bin/lipo', ['-verify_arch', arch === 'x64' ? 'x86_64' : 'arm64', executable], { timeout: 10_000, maxBuffer: 4096 });
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { timeout: 60_000, maxBuffer: 4096 });
  } catch { throw new Error('The update app failed its bundle, version, architecture or code-signature check. Your installed app was not replaced.'); }
}
export async function replaceApplication(target: string, incoming: string, backup: string, launch: (app: string) => Promise<unknown>): Promise<void> {
  await ownedDirectory(target); await ownedDirectory(incoming); await absent(backup);
  await rename(target, backup);
  let placed = false;
  try {
    await absent(target); await rename(incoming, target); placed = true;
    await launch(target);
  } catch (error) {
    try { if (placed) await rename(target, incoming); await absent(target); await rename(backup, target); }
    catch { throw new Error('Update interrupted. Your previous app is preserved in the ZoomTime-previous backup beside the installed app. Restore it in Finder.'); }
    throw error;
  }
}
interface InstallJob { schema: 1; id: string; target: string; oldVersion: string; parentPid: number; dev: number; ino: number; release: UpdateRelease }
const incomingFor = (job: InstallJob) => join(dirname(job.target), `.ZoomTime-update-${job.id}`, 'ZoomTime.app');
const backupFor = (job: InstallJob) => join(dirname(job.target), `ZoomTime-previous-${job.oldVersion}-${job.id}.app`);
async function journal(directory: string, stage: string): Promise<void> { await writeFile(join(directory, 'result.json'), JSON.stringify({ stage }), { mode: 0o600 }); }
export async function prepareInstallation(archive: string, release: UpdateRelease, executable: string, current: string, arch: string, root: string, home: string): Promise<string> {
  const target = installedApplication(executable, home);
  await validateApplication(target, current, arch);
  try { await access(dirname(target), constants.W_OK); } catch { throw new Error('This app folder is not writable. Use your own Applications folder or finish with the verified Finder download. No administrator helper is used.'); }
  await mkdir(root, { recursive: true, mode: 0o700 }); await ownedDirectory(root);
  if (await realpath(root) !== root || ((await stat(root)).mode & 0o077)) throw new Error('The private update directory has unsafe permissions.');
  const directory = await mkdtemp(join(root, 'job-')), info = await lstat(target);
  const job: InstallJob = { schema: 1, id: randomUUID(), target, oldVersion: current, parentPid: process.pid, dev: info.dev, ino: info.ino, release };
  await verifyArchive(archive, release);
  const copy = join(directory, 'release.zip'); await copyFile(archive, copy, constants.COPYFILE_EXCL); await chmod(copy, 0o600);
  await verifyArchive(copy, release); await quarantineArchive(copy, release.url);
  const incoming = await extractApplication(copy, dirname(incomingFor(job)));
  await validateApplication(incoming, release.version, arch); await quarantineArchive(incoming, release.url);
  await writeFile(join(directory, 'job.json'), JSON.stringify(job), { flag: 'wx', mode: 0o600 });
  await journal(directory, 'prepared'); return directory;
}
async function readJob(directory: string, executable: string, arch: string, root: string, home: string): Promise<InstallJob> {
  if (dirname(directory) !== root || !/^job-[a-zA-Z0-9]{6}$/.test(basename(directory))) throw new Error('Invalid private update handoff.');
  await ownedDirectory(root); await ownedDirectory(directory);
  if (await realpath(directory) !== directory || ((await stat(directory)).mode & 0o077)) throw new Error('Unsafe update handoff directory.');
  const file = join(directory, 'job.json'), info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.size > 65536 || (info.mode & 0o077)) throw new Error('Unsafe update handoff file.');
  const job = JSON.parse(await readFile(file, 'utf8')) as InstallJob;
  if (job.schema !== 1 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(job.id) || job.target !== installedApplication(executable, home) ||
    !Number.isSafeInteger(job.parentPid) || job.parentPid <= 1 || job.parentPid === process.pid || job.parentPid !== process.ppid || !Number.isSafeInteger(job.dev) || !Number.isSafeInteger(job.ino) || !job.release) throw new Error('Invalid update handoff data.');
  const r = job.release;
  const selected = selectUpdate([{ draft: false, prerelease: r.prerelease, tag_name: `v${r.version}`, assets: [{ name: r.name, browser_download_url: r.url, digest: `sha256:${r.sha256}`, size: r.size, state: 'uploaded' }] }], job.oldVersion, arch);
  if (!selected.available) throw new Error('Update handoff is not a newer release.');
  return job;
}
const launchApplication = (path: string, directory: string) => exec('/usr/bin/open', ['-n', path, '--args', '--zoomtime-update-result', directory], { timeout: 15_000, maxBuffer: 4096 });
export async function runUpdateHelper(directory: string, executable: string, arch: string, root: string, home: string): Promise<void> {
  const job = await readJob(directory, executable, arch, root, home);
  try {
    await verifyArchive(join(directory, 'release.zip'), job.release);
    await validateApplication(job.target, job.oldVersion, arch);
    const info = await lstat(job.target);
    if (info.dev !== job.dev || info.ino !== job.ino) throw new Error('The installed app changed during preparation.');
    await validateApplication(incomingFor(job), job.release.version, arch);
    await absent(backupFor(job)); await writeFile(join(directory, 'ready'), 'ready', { flag: 'wx', mode: 0o600 });
    const end = Date.now() + 60_000;
    while (true) {
      try { process.kill(job.parentPid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') break; throw error; }
      if (Date.now() > end) throw new Error('The app did not quit; no replacement was attempted.');
      await delay(200);
    }
    const current = await lstat(job.target);
    if (current.dev !== job.dev || current.ino !== job.ino) throw new Error('The installed app changed before replacement.');
    await journal(directory, 'replacing');
    await replaceApplication(job.target, incomingFor(job), backupFor(job), path => launchApplication(path, directory));
    await journal(directory, 'installed');
  } catch {
    await journal(directory, 'failed-previous-app-preserved');
    try { process.kill(job.parentPid, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        try { await validateApplication(job.target, job.oldVersion, arch); await launchApplication(job.target, directory); } catch { /* The previous bundle remains available for manual recovery. */ }
      }
    }
    throw new Error('Update failed. Your previous app or its backup has been preserved.');
  }
}
export async function startUpdateHelper(directory: string, executable: string): Promise<() => void> {
  const child = spawn(executable, ['--zoomtime-update-helper', directory, `--user-data-dir=${join(directory, 'helper-profile')}`], { detached: true, stdio: 'ignore', cwd: directory });
  let failed = false; child.once('error', () => { failed = true; });
  try {
    for (let attempt = 0; attempt < 400; attempt++) {
      if (failed || child.exitCode !== null) throw new Error('The update helper could not prepare installation. Your app remains installed.');
      try { if (await readFile(join(directory, 'ready'), 'utf8') === 'ready') { child.unref(); return () => { child.kill('SIGTERM'); }; } }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await delay(200);
    }
    throw new Error('The update helper took too long to prepare. Your app remains installed.');
  } catch (error) { child.kill('SIGTERM'); throw error; }
}

export async function updateOutcome(directory: string, root: string): Promise<string | null> {
  try {
    if (dirname(directory) !== root || !/^job-[a-zA-Z0-9]{6}$/.test(basename(directory))) return null;
    await ownedDirectory(directory); if (await realpath(directory) !== directory) return null;
    const file = join(directory, 'result.json'), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 || info.uid !== process.getuid?.() || (info.mode & 0o077)) return null;
    const { stage } = JSON.parse(await readFile(file, 'utf8'));
    return stage === 'failed-previous-app-preserved' ? 'The update could not finish. Your previous app was preserved or restored. Use the verified download in Finder if needed.' : stage === 'installed' ? 'Update installed. Your previous app is kept beside ZoomTime as a recovery backup.' : null;
  } catch { return null; }
}
