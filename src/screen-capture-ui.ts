import type { CaptureSources, ScreenCaptureState } from './screen-capture.ts';

export function setupScreenCapture(): void {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const mode = get<HTMLSelectElement>('screen-kind'), choices = get<HTMLSelectElement>('screen-sources');
  const start = get<HTMLButtonElement>('screen-start'), stop = get<HTMLButtonElement>('screen-stop');
  let sources: CaptureSources = { displays: [], windows: [] };
  let state: ScreenCaptureState = { active: false, busy: false, canReveal: false, message: '' };
  let discovering = false;
  function render(): void {
    start.disabled = state.busy || discovering || choices.selectedOptions.length === 0;
    stop.disabled = !state.active && !state.busy;
    start.textContent = state.active ? 'Switch selected sources' : 'Start local capture';
    get<HTMLButtonElement>('screen-request').disabled = state.busy || discovering;
    get<HTMLButtonElement>('screen-refresh').disabled = state.busy || discovering;
    get<HTMLButtonElement>('screen-reveal').hidden = !state.canReveal;
    if (get('screen-status').textContent !== state.message) get('screen-status').textContent = state.message;
    get('screen-statistics').textContent = state.statistics ? JSON.stringify(state.statistics, null, 2) : '';
  }
  function populate(): void {
    choices.replaceChildren(); choices.multiple = mode.value === 'window'; choices.size = choices.multiple ? 4 : 1;
    const options = mode.value === 'window' ? sources.windows.map(w => ({ id: w.id, label: `${w.application} — ${w.title}` })) :
      sources.displays.map(d => ({ id: d.id, label: `Display ${d.id} · ${d.width} × ${d.height}` }));
    for (const item of options) choices.add(new Option(item.label, String(item.id)));
    render();
  }
  async function run(operation: () => Promise<unknown>): Promise<void> {
    try { await operation(); } catch (error) {
      get('screen-status').textContent = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Screen capture failed.';
    }
  }
  async function discover(request: boolean): Promise<void> {
    discovering = true; render();
    try { sources = await window.zoomtime.discoverScreenSources(request); populate(); }
    finally { discovering = false; render(); }
  }
  get('screen-request').addEventListener('click', () => { void run(() => discover(true)); });
  get('screen-settings').addEventListener('click', () => { void run(() => window.zoomtime.openScreenCaptureSettings()); });
  get('screen-refresh').addEventListener('click', () => { void run(() => discover(false)); });
  mode.addEventListener('change', populate); choices.addEventListener('change', render);
  start.addEventListener('click', () => { void run(() => window.zoomtime.startScreenCapture({ kind: mode.value as 'display' | 'window', ids: Array.from(choices.selectedOptions, option => Number(option.value)) })); });
  stop.addEventListener('click', () => { void run(() => window.zoomtime.stopScreenCapture()); });
  get('screen-reveal').addEventListener('click', () => { void run(() => window.zoomtime.revealScreenCapture()); });
  get<HTMLDialogElement>('settings').addEventListener('close', () => { void run(() => window.zoomtime.stopScreenCapture()); });
  window.addEventListener('beforeunload', () => { void window.zoomtime.stopScreenCapture(); });
  window.zoomtime.onScreenCaptureState(next => { state = next; render(); });
  void run(async () => { state = await window.zoomtime.getScreenCaptureState(); render(); });
  render();
}
