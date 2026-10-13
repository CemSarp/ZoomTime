import stylesheet from './index.css';
import type { WindowState } from './bridge.ts';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = stylesheet;
document.head.append(link);
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
// A renderer reload must change this identifier so the probe can reveal interruptions.
const rendererSession = crypto.randomUUID();
document.body.dataset.rendererSession = rendererSession;
element('session').textContent = rendererSession.slice(0, 8);
const canvas = element<HTMLCanvasElement>('probe');
const context = canvas.getContext('2d');
if (!context) throw new Error('The window test requires a canvas');
let current: WindowState | null = null;
let frames = 0;
const startedAt = performance.now();
let lastFrame = -Infinity;
let lastLabel = -Infinity;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function showError(): void {
  element('error').textContent = 'The window could not change mode. Use the Window menu to restore, or restart ZoomTime.';
}
function applyState(state: WindowState): void {
  current = state;
  document.body.dataset.mode = state.mode;
  element('size').textContent = `${state.bounds.width} × ${state.bounds.height}`;
  element('preferences').hidden = !state.preferencesError;
  element('mode-status').textContent = state.mode === 'mini' ? 'Mini mode' : 'Normal mode';
}
element('mini').addEventListener('click', () => { void window.zoomtime.setMode('mini').then(applyState).catch(showError); });
element('restore').addEventListener('click', () => { void window.zoomtime.restore().then(applyState).catch(showError); });
element('close').addEventListener('click', () => { void window.zoomtime.close().catch(showError); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && current?.mode === 'mini') { event.preventDefault(); void window.zoomtime.restore().then(applyState).catch(showError); }
});
window.zoomtime.onState(applyState);
void window.zoomtime.getState().then(applyState).catch(showError);

function draw(now: number): void {
  if (now - lastFrame >= 1000 / 30) {
    lastFrame = now;
    const seconds = (now - startedAt) / 1000;
    const t = reducedMotion.matches ? 0 : seconds;
    const ctx = context!;
    const gradient = ctx.createLinearGradient(0, 0, 640, 360);
    gradient.addColorStop(0, '#204b46'); gradient.addColorStop(0.55, '#173331'); gradient.addColorStop(1, '#101c22');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 640, 360);
    for (let i = 0; i < 3; i++) {
      const x = 320 + Math.sin(t * 0.45 + i * 2.1) * 180;
      const y = 180 + Math.cos(t * 0.6 + i * 1.7) * 85;
      ctx.beginPath(); ctx.arc(x, y, 42 + i * 12, 0, Math.PI * 2);
      ctx.fillStyle = ['#91dec4', '#dfbc8b', '#589b99'][i]; ctx.globalAlpha = 0.72; ctx.fill();
    }
    ctx.globalAlpha = 1;
    frames++;
    if (now - lastLabel > 250) {
      lastLabel = now;
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
      element('elapsed').textContent = `${minutes}:${remainder}`;
      element('frames').textContent = frames.toLocaleString('en-GB');
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
