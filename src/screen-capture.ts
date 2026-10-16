import { execFile, spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface CaptureSelection { kind: 'display' | 'window'; ids: number[] }
export interface CaptureSources {
  displays: { id: number; width: number; height: number }[];
  windows: { id: number; title: string; application: string }[];
}
export interface ScreenCaptureState {
  active: boolean; busy: boolean; message: string; canReveal: boolean;
  statistics?: Record<string, unknown>;
}
export function captureSelection(value: unknown): CaptureSelection {
  const selection = value as CaptureSelection;
  if (!selection || typeof selection !== 'object' || Object.keys(selection).sort().join(',') !== 'ids,kind' ||
      !Array.isArray(selection.ids) || new Set(selection.ids).size !== selection.ids.length ||
      !selection.ids.every(id => Number.isInteger(id) && id > 0 && id <= 0xffff_ffff) ||
      !(selection.kind === 'display' && selection.ids.length === 1 || selection.kind === 'window' && selection.ids.length >= 1 && selection.ids.length <= 4)) {
    throw new Error('Choose one display or one to four different windows.');
  }
  return { kind: selection.kind, ids: [...selection.ids] };
}
const execute = promisify(execFile);
const PERMISSION_RECOVERY = 'Screen Recording is not authorized for this copy of ZoomTime. Open Screen Recording settings and enable the current app. If an older copy is already enabled, reauthorize this copy there, then quit and reopen it from Applications and Refresh sources. An ad-hoc build can have a different signature from the saved grant.';
export class ScreenCapture {
  state: ScreenCaptureState = { active: false, busy: false, message: 'Screen capture is off. Protected video capture is unsupported.', canReveal: false };
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = false;
  private epoch = 0;
  private output: string | null = null;
  private binary: string;
  private root: string;
  private changed: (state: ScreenCaptureState) => void;
  private stopping: Promise<void> | null = null;
  private discoveryChild: ChildProcess | null = null;
  private permissionRequested = false;
  constructor(binary: string, root: string, changed: (state: ScreenCaptureState) => void) {
    this.binary = binary; this.root = root; this.changed = changed;
  }
  get inUse(): boolean { return this.pending || this.child !== null; }
  private publish(patch: Partial<ScreenCaptureState>): void { this.state = { ...this.state, ...patch }; this.changed(this.state); }
  async openPermissionSettings(open: () => Promise<unknown>): Promise<void> {
    await open();
    this.publish({ message: 'In Screen Recording settings, enable this copy of ZoomTime. After changing permissions, quit and reopen it from Applications, then Refresh sources. An older build’s saved grant may not authorize the current copy.' });
  }
  async discover(request: boolean): Promise<CaptureSources> {
    if (this.pending) throw new Error('Wait for the screen capture operation.');
    this.pending = true;
    const epoch = this.epoch;
    this.publish({ busy: true });
    try {
      if (request) {
        const preflight = execute(this.binary, ['permission'], { timeout: 15_000, maxBuffer: 1_048_576 });
        this.discoveryChild = preflight.child;
        const { stdout: status } = await preflight;
        if (epoch !== this.epoch) throw new Error('Screen capture discovery cancelled.');
        if (JSON.parse(status).granted !== true) {
          if (this.permissionRequested) throw new Error(PERMISSION_RECOVERY);
          this.permissionRequested = true;
          const operation = execute(this.binary, ['request'], { timeout: 60_000, maxBuffer: 1_048_576 });
          this.discoveryChild = operation.child;
          const { stdout } = await operation;
          if (epoch !== this.epoch) throw new Error('Screen capture discovery cancelled.');
          if (JSON.parse(stdout).granted !== true) throw new Error(PERMISSION_RECOVERY);
        }
      }
      const operation = execute(this.binary, ['discover'], { timeout: 15_000, maxBuffer: 1_048_576 });
      this.discoveryChild = operation.child;
      const { stdout } = await operation;
      if (epoch !== this.epoch) throw new Error('Screen capture discovery cancelled.');
      const result = JSON.parse(stdout) as CaptureSources;
      if (!Array.isArray(result.displays) || !Array.isArray(result.windows)) throw new Error('Invalid capture source response.');
      this.publish({ message: 'Choose a display or up to four windows. Start saves a local diagnostic file; nothing is sent to your partner.' });
      return result;
    } catch (error) {
      let permissionDenied = false;
      if (error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string') {
        try { permissionDenied = JSON.parse(error.stdout).reason === 'screen-permission'; } catch { /* Native diagnostics remain private. */ }
      }
      const message = epoch !== this.epoch ? 'Screen capture discovery cancelled.' : permissionDenied ? PERMISSION_RECOVERY : error instanceof Error && !('cmd' in error) ? error.message : 'Screen discovery failed. Check Screen Recording permission in System Settings, then retry.';
      this.publish({ message }); throw new Error(message);
    } finally { this.discoveryChild = null; this.pending = false; this.publish({ busy: false }); }
  }
  async start(value: unknown): Promise<void> {
    const selection = captureSelection(value);
    if (this.pending) throw new Error('Wait for screen discovery to finish.');
    if (this.child) {
      if (this.state.busy) throw new Error('Wait for the capture source change.');
      this.publish({ busy: true }); this.child.stdin.write(JSON.stringify(selection) + '\n'); return;
    }
    this.pending = true;
    const epoch = this.epoch;
    this.publish({ busy: true, canReveal: false, message: 'Starting screen capture…', statistics: undefined });
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const directory = await mkdtemp(join(this.root, 'session-'));
      if (epoch !== this.epoch) return;
      this.output = join(directory, 'capture.h264');
      const child = spawn(this.binary, ['capture', JSON.stringify(selection), this.output], { stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      child.stdin.on('error', () => {});
      let received = 0, failed = false, encoded = 0, previewWritten = false;
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on('line', line => {
        if (child !== this.child) return;
        received += Buffer.byteLength(line);
        if (line.length > 16_384 || received > 16_777_216) { failed = true; this.publish({ message: 'Capture helper exceeded its status limit.' }); void this.stop(); return; }
        try {
          const event = JSON.parse(line);
          if (event.type === 'selected') this.publish({ active: true, busy: false, message: 'Capturing locally · 720p / 30 fps · protected-content capture unsupported.' });
          else if (event.type === 'statistics') this.publish({ statistics: event });
          else if (event.type === 'selection-error') this.publish({ busy: false, message: String(event.message).slice(0, 1000) });
          else if (event.type === 'error') { failed = true; this.publish({ message: String(event.message).slice(0, 1000) }); void this.stop(); }
          else if (event.type === 'stopped') {
            encoded = Number(event.encoder?.encoded) || 0; previewWritten = event.previewWritten === true;
            this.publish({ statistics: event });
          }
        } catch { failed = true; this.publish({ message: 'Invalid capture helper response.' }); void this.stop(); }
      });
      // Do not log native diagnostics; stdout is the bounded structured status channel.
      child.stderr.resume();
      const startup = setTimeout(() => {
        if (this.child === child && !this.state.active) { failed = true; this.publish({ message: 'Screen capture timed out. Check macOS permission and retry.' }); void this.stop(); }
      }, 15_000);
      child.once('error', () => { failed = true; this.publish({ message: 'Capture helper could not start. Rebuild the native helper for this Mac.' }); });
      child.once('close', code => {
        clearTimeout(startup); lines.close();
        if (this.child !== child) return;
        this.child = null;
        this.publish({ active: false, busy: false, canReveal: code === 0 && !failed && encoded > 0,
          message: failed ? this.state.message : code !== 0 ? 'Capture helper exited unexpectedly. Any partial output is preserved.' : encoded === 0
            ? 'Capture stopped with no encoded frames. Retry and allow the source to produce a frame.'
            : previewWritten ? 'Capture stopped. Local H.264 and first-frame PNG are ready in Finder.' : 'Capture stopped. Local H.264 is ready; no complete first-frame preview was available.' });
      });
    } finally { this.pending = false; if (!this.child) this.publish({ busy: false }); }
  }
  async stop(): Promise<void> {
    this.epoch += 1;
    this.discoveryChild?.kill('SIGTERM');
    if (this.stopping) return this.stopping;
    const child = this.child;
    if (!child) { this.publish({ active: false, busy: false }); return; }
    this.publish({ busy: true });
    this.stopping = new Promise<void>(resolve => {
      const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('close', () => { clearTimeout(kill); resolve(); });
      child.stdin.on('error', () => {}); child.stdin.end('stop\n');
    });
    try { await this.stopping; } finally { this.stopping = null; }
  }
  outputPath(): string {
    if (!this.output || !this.state.canReveal || this.inUse) throw new Error('Stop a successful capture before revealing its output.');
    return this.output;
  }
}
