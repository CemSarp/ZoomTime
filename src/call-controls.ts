export function renderMediaButton(button: HTMLButtonElement, kind: 'microphone' | 'camera', off: boolean): void {
  const label = kind === 'microphone' ? off ? 'Unmute microphone' : 'Mute microphone' : off ? 'Turn camera on' : 'Turn camera off';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(off));
  const symbol = `${kind}-${off}`;
  if (button.dataset.symbol === symbol) return;
  button.dataset.symbol = symbol;
  button.dataset.off = String(off);
  const path = kind === 'microphone'
    ? '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M9 21h6"/>'
    : '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/>';
  // Only fixed, local artwork is inserted; names and other user content remain textContent.
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}${off ? '<path data-slash="true" d="m3 3 18 18"/>' : ''}</svg>`;
}
