import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireAppleSilicon } from './platform.ts';

export const RELEASES_API = 'https://api.github.com/repos/CemSarp/ZoomTime/releases?per_page=100';
const REPOSITORY = 'https://github.com/CemSarp/ZoomTime';
const MAX_ARCHIVE = 512 * 1024 * 1024;
export interface UpdateRelease { version: string; name: string; url: string; sha256: string; size: number; prerelease: boolean }
export interface UpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
  currentVersion: string;
  version?: string;
  prerelease?: boolean;
  percent?: number;
  canReveal?: boolean;
  message: string;
}
function versionParts(value: string): number[] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Unsupported release version.');
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Unsupported release version.');
  return parts;
}
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function selectUpdate(value: unknown, current: string, arch: string): { available: boolean; release?: UpdateRelease } {
  versionParts(current);
  if (!Array.isArray(value) || value.length > 100) throw new Error('GitHub returned invalid release information.');
  requireAppleSilicon(arch);
  const releases = value.filter(item => item && item.draft === false && typeof item.prerelease === 'boolean' && typeof item.tag_name === 'string' && /^v\d+\.\d+\.\d+$/.test(item.tag_name));
  releases.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
  const newest = releases[0];
  if (!newest || compareVersions(newest.tag_name.slice(1), current) <= 0) return { available: false };
  const version = newest.tag_name.slice(1), name = `ZoomTime-darwin-${arch}-${version}.zip`;
  const assets = Array.isArray(newest.assets) ? newest.assets.filter((item: { name?: unknown } | null) => item?.name === name) : [];
  const asset = assets[0];
  if (assets.length !== 1 || asset.state !== 'uploaded' || asset.browser_download_url !== `${REPOSITORY}/releases/download/v${version}/${name}` ||
    typeof asset.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_ARCHIVE) {
    throw new Error('The newer release has no valid, checksum-protected download for this Mac. Please ask the publisher to finish uploading it.');
  }
  return { available: true, release: { version, name, url: asset.browser_download_url, sha256: asset.digest.slice(7), size: asset.size, prerelease: newest.prerelease } };
}
export function allowedDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      ((url.hostname === 'github.com' && url.pathname.startsWith('/CemSarp/ZoomTime/releases/download/')) ||
        ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname));
  } catch { return false; }
}
async function githubResponse(url: string, signal: AbortSignal): Promise<Response> {
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'ZoomTime', Accept: url === RELEASES_API ? 'application/vnd.github+json' : 'application/octet-stream' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location || url === RELEASES_API) throw new Error('GitHub returned an unexpected redirect.');
      const next = new URL(location, url).href;
      if (!allowedDownloadUrl(next)) throw new Error('GitHub redirected the download to an untrusted address.');
      url = next; continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is limiting update requests. Try again later.' : 'GitHub could not provide the update. Check your internet connection and try again.');
    }
    return response;
  }
  throw new Error('GitHub returned too many redirects.');
}
export async function fetchReleases(): Promise<unknown> {
  const response = await githubResponse(RELEASES_API, AbortSignal.timeout(15_000));
  if (!response.body) throw new Error('GitHub returned an empty response.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 4 * 1024 * 1024) throw new Error('GitHub release information is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('GitHub returned invalid release information.'); }
}
export async function verifyArchive(path: string, release: UpdateRelease): Promise<void> {
  const info = await stat(path);
  if (!info.isFile() || info.size !== release.size) throw new Error('The update download is incomplete. Try downloading it again.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== release.sha256) throw new Error('The update checksum does not match. This download cannot be installed. Check again and retry.');
}
// Foundation adds quarantine; never remove it or bypass Gatekeeper for downloaded code.
export async function quarantineArchive(path: string, source: string): Promise<void> {
  const script = `ObjC.import('Foundation'); ObjC.import('CoreServices');
function run(args) {
  var properties = $.NSMutableDictionary.alloc.init;
  function set(key, value) { properties.setObjectForKey(value, ObjC.castRefToObject(key)); }
  set($.kLSQuarantineAgentNameKey, $('ZoomTime'));
  set($.kLSQuarantineAgentBundleIdentifierKey, $('com.cemsarp.zoomtime'));
  set($.kLSQuarantineTimeStampKey, $.NSDate.date);
  set($.kLSQuarantineTypeKey, ObjC.castRefToObject($.kLSQuarantineTypeWebDownload));
  set($.kLSQuarantineDataURLKey, $.NSURL.URLWithString(args[1]));
  var file = $.NSURL.fileURLWithPath(args[0]);
  if (!file.setResourceValueForKeyError(properties, $.NSURLQuarantinePropertiesKey, null)) throw Error('Could not quarantine download');
}`;
  try {
    await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, path, source], { timeout: 10_000, maxBuffer: 4096 });
    const result = await promisify(execFile)('/usr/bin/xattr', ['-p', 'com.apple.quarantine', path], { timeout: 5000, maxBuffer: 4096 });
    if (!result.stdout.trim()) throw new Error('No quarantine metadata');
  } catch { throw new Error('macOS could not apply download security metadata. The update will not be offered for installation.'); }
}
export async function saveUpdate(release: UpdateRelease, downloads: string, progress: (percent: number) => void): Promise<string> {
  const directory = await mkdtemp(join(downloads, 'ZoomTime-update-'));
  const partial = join(directory, release.name + '.download');
  await (await open(partial, 'wx', 0o600)).close();
  await quarantineArchive(partial, release.url);
  const response = await githubResponse(release.url, AbortSignal.timeout(10 * 60_000));
  if (!response.body) throw new Error('GitHub returned an empty download.');
  let bytes = 0, percent = -1;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > release.size) { callback(new Error('The update download exceeds its expected size.')); return; }
    const next = Math.floor(bytes / release.size * 100);
    if (next !== percent) { percent = next; progress(next); }
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), meter, createWriteStream(partial, { flags: 'r+' }));
  await verifyArchive(partial, release);
  const path = join(directory, release.name);
  await rename(partial, path);
  return path;
}
export class Updates {
  state: UpdateState;
  private selected?: UpdateRelease;
  private path?: string;
  private busy = false;
  private current: string;
  private arch: string;
  private downloads: string;
  private changed: (state: UpdateState) => void;
  private load: typeof fetchReleases;
  private save: typeof saveUpdate;
  constructor(current: string, arch: string, downloads: string, changed: (state: UpdateState) => void, load = fetchReleases, save = saveUpdate) {
    this.current = current; this.arch = arch; this.downloads = downloads; this.changed = changed; this.load = load; this.save = save;
    this.state = { status: 'idle', currentVersion: current, message: 'Updates are checked only when you ask. Verified releases can install and restart ZoomTime.' };
  }
  private publish(state: Omit<UpdateState, 'currentVersion'>): void { this.state = { currentVersion: this.current, ...state }; this.changed(this.state); }
  async check(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.selected = undefined; this.path = undefined;
    this.publish({ status: 'checking', message: 'Checking GitHub…' });
    try {
      const result = selectUpdate(await this.load(), this.current, this.arch);
      this.selected = result.release;
      if (result.release) this.publish({ status: 'available', version: result.release.version, prerelease: result.release.prerelease,
        message: `Version ${result.release.version}${result.release.prerelease ? ' (prerelease)' : ''} is available. Download only if you trust this published build.` });
      else this.publish({ status: 'current', message: `No newer published build. You have version ${this.current}.` });
    } catch (error) { this.fail(error); } finally { this.busy = false; }
  }
  async download(): Promise<void> {
    if (this.busy || !this.selected || this.state.status !== 'available') return;
    this.busy = true; const release = this.selected;
    const state = { version: release.version, prerelease: release.prerelease };
    this.publish({ ...state, status: 'downloading', percent: 0, message: 'Downloading from GitHub…' });
    try {
      this.path = await this.save(release, this.downloads, percent => this.publish({ ...state, status: 'downloading', percent, message: `Downloading… ${percent}%` }));
      this.publish({ ...state, status: 'ready', message: 'Download verified. Finish your call, then choose Install and restart. Your previous app is kept as a backup. macOS may ask you to approve this private build.' });
    } catch (error) { this.path = undefined; this.fail(error); } finally { this.busy = false; }
  }
  async install(action: (path: string, release: UpdateRelease) => Promise<void>): Promise<void> {
    if (this.busy || this.state.status !== 'ready' || !this.path || !this.selected) return;
    this.busy = true;
    this.publish({ status: 'installing', version: this.selected.version, prerelease: this.selected.prerelease, message: 'Preparing the verified update. ZoomTime will quit and reopen; your previous app will be preserved.' });
    let verified = false;
    try { await verifyArchive(this.path, this.selected); verified = true; await action(this.path, this.selected); }
    catch (error) { this.fail(error, verified); this.busy = false; }
  }
  async verifiedPath(): Promise<string> {
    if (this.busy || (this.state.status !== 'ready' && !this.state.canReveal) || !this.path || !this.selected) throw new Error('Download and verify an update first.');
    this.busy = true;
    try { await verifyArchive(this.path, this.selected); return this.path; }
    catch (error) { this.path = undefined; this.fail(error); throw new Error(this.state.message); }
    finally { this.busy = false; }
  }
  private fail(error: unknown, canReveal = false): void {
    const message = error instanceof Error && !('code' in error) && error.name === 'Error' ? error.message : 'The update could not complete. Check your internet connection, free disk space and Downloads access, then check again.';
    this.publish({ status: 'error', message, canReveal });
  }
}
