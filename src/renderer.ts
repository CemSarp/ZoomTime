import stylesheet from './index.css';
import { decodePreferences, type Preferences, type VideoQuality } from './preferences.ts';
import { DeviceCheck } from './device-check.ts';
import { setupScreenCapture } from './screen-capture-ui.ts';
import { MediaCall } from './media-call.ts';
import { GroupVideoView } from './call-view.ts';
import { renderMediaButton } from './call-controls.ts';
import { emptyCallingState, type StartCall, type CallingState } from './calling-state.ts';
import type { UpdateState } from './updates.ts';
import type { WindowState } from './bridge.ts';
const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = stylesheet; document.head.append(link);
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const show = (id: string, visible: boolean) => { element(id).hidden = !visible; };
const disabled = (id: string, value: boolean) => { element<HTMLButtonElement>(id).disabled = value; };
const setText = (id: string, value: string) => { if (element(id).textContent !== value) element(id).textContent = value; };
const rendererSession = crypto.randomUUID(); document.body.dataset.rendererSession = rendererSession; element('session').textContent = rendererSession.slice(0, 8);
const startedAt = Date.now(); let connectedAt: number | null = null;
let windowState: WindowState | null = null;
let preferences = decodePreferences(null);
let settingsBusy = false;
let outputVolumeDraft: number | null = null;
let speakerEchoDraft: boolean | null = null;
let resizingPreview = false;
let preferencesTimer: ReturnType<typeof setTimeout> | undefined;
const settings = element<HTMLDialogElement>('settings');
const selfPreview = element<HTMLDivElement>('self-preview');
let calling: CallingState = emptyCallingState();
const selected = new Set<string>();
let selectionTouched = false;
let renamingId: string | null = null;
const renameDialog = element<HTMLDialogElement>('rename-member');
let action: StartCall | null = null; let setupBusy = false; let uiError = '';
const local = element<HTMLVideoElement>('local');
const videos = new GroupVideoView(element('remote-grid'), element<HTMLSelectElement>('focus-person'), () => render(), element('participant-volumes'));
const media = new MediaCall(window.zoomtime, { local, remote: id => videos.remote(id), removeRemote: id => videos.remove(id), changed: () => render() });
const check = new DeviceCheck(window.zoomtime, element<HTMLVideoElement>('check-video'), () => renderCheck());
function error(error: unknown): void { uiError = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'That action failed. Check the connection and retry.'; if (settings.open) { setText('settings-error', uiError); show('settings-error', true); } render(); }
function run(operation: () => Promise<unknown>): void { uiError = ''; void operation().catch(error); }
async function setup(operation: () => Promise<void>): Promise<void> {
  if (setupBusy) return; setupBusy = true; uiError = ''; render();
  try { await operation(); } catch (cause) { element('toast').textContent = ''; error(cause); } finally { setupBusy = false; render(); }
}
function applyWindow(state: WindowState): void {
  windowState = state; document.body.dataset.mode = state.mode;
  if (state.mode === 'mini') { if (settings.open) settings.close(); if (renameDialog.open) renameDialog.close(); }
  const changedQuality = preferences.quality !== state.preferences.quality;
  const changedEcho = preferences.speakerEchoReduction !== state.preferences.speakerEchoReduction;
  preferences = state.preferences;
  if (changedEcho) {
    void media.setSpeakerEchoReduction(preferences.speakerEchoReduction).catch(error);
    void check.setSpeakerEchoReduction(preferences.speakerEchoReduction).catch(error);
  }
  applyPreferences();
  if (changedQuality) void media.setQuality(preferences.quality).catch(error);
  element('size').textContent = `${state.bounds.width} × ${state.bounds.height}`; show('preferences', state.preferencesError);
}
function applyPreferences(): void {
  const outputVolume = outputVolumeDraft ?? preferences.outputVolume;
  videos.setOutputVolume(outputVolume);
  element<HTMLInputElement>('output-volume').value = String(outputVolume);
  element('output-volume-value').textContent = `${outputVolume}%`;
  document.body.dataset.mirror = String(preferences.mirror);
  document.body.dataset.miniSelf = String(preferences.miniSelf);
  element<HTMLInputElement>('normal-always-on-top').checked = preferences.normalAlwaysOnTop;
  element<HTMLInputElement>('mini-always-on-top').checked = preferences.miniAlwaysOnTop;
  element<HTMLInputElement>('speaker-echo-reduction').checked = speakerEchoDraft ?? preferences.speakerEchoReduction;
  element<HTMLInputElement>('mirror').checked = preferences.mirror;
  element<HTMLInputElement>('mini-self-setting').checked = preferences.miniSelf;
  element<HTMLSelectElement>('quality').value = preferences.quality;
  element<HTMLInputElement>('preview-size').value = String(preferences.previewSize);
  renderSpeakerEcho();
  selfPreview.style.width = `${preferences.previewSize}%`;
  element('mini-self').setAttribute('aria-pressed', String(preferences.miniSelf));
  element('mini-self').setAttribute('aria-label', preferences.miniSelf ? 'Hide your camera preview' : 'Show your camera preview');
  element('mini-self').title = preferences.miniSelf ? 'Hide your camera preview' : 'Show your camera preview';
}
async function updatePreferences(patch: Partial<Preferences>): Promise<void> {
  if (settingsBusy) { applyPreferences(); return; }
  clearTimeout(preferencesTimer);
  const next = { ...preferences, ...patch };
  settingsBusy = true;
  for (const id of ['quality', 'mirror', 'mini-self-setting', 'preview-size', 'mini-self', 'normal-always-on-top', 'mini-always-on-top', 'speaker-echo-reduction', 'output-volume']) (element(id) as HTMLInputElement).disabled = true;
  show('settings-error', false);
  try {
    await media.setQuality(next.quality);
    await media.setSpeakerEchoReduction(next.speakerEchoReduction);
    await check.setSpeakerEchoReduction(next.speakerEchoReduction);
    applyWindow(await window.zoomtime.setPreferences(next));
  } catch (cause) {
    await Promise.allSettled([media.setSpeakerEchoReduction(preferences.speakerEchoReduction), check.setSpeakerEchoReduction(preferences.speakerEchoReduction)]);
    applyPreferences(); error(cause); element('settings-error').textContent = uiError; show('settings-error', true);
  } finally {
    settingsBusy = false;
    for (const id of ['quality', 'mirror', 'mini-self-setting', 'preview-size', 'mini-self', 'normal-always-on-top', 'mini-always-on-top', 'speaker-echo-reduction', 'output-volume']) (element(id) as HTMLInputElement).disabled = false;
    renderCheck();
  }
}
function renderSpeakerEcho(): void {
  const status = check.state.active ? check.state.speakerEcho : media.state.speakerEcho;
  const usingMicrophone = check.state.active || !!local.srcObject;
  const activeStatus = {
    all: 'System-audio cancellation applied. Acoustic results still depend on your speakers and room.',
    unavailable: 'Unavailable on this microphone/runtime. Standard call echo cancellation continues.',
    standard: 'Off. Standard call echo cancellation stays enabled.',
  };
  setText('speaker-echo-status', usingMicrophone ? activeStatus[status] : preferences.speakerEchoReduction
    ? 'On for calls and device checks. You can change this during a call.' : activeStatus.standard);
}
function renderCheck(): void {
  renderSpeakerEcho();
  const state = check.state, busy = state.active || state.capturing;
  disabled('speaker-echo-reduction', settingsBusy || state.capturing || media.state.capturing);
  disabled('check-start', !!calling.call || media.state.capturing || !!local.srcObject || busy);
  show('check-start', !busy); show('check-stop', busy); show('check-video', state.active); show('check-audio', state.active);
  element<HTMLInputElement>('check-listen').disabled = !state.active;
  element<HTMLInputElement>('check-listen').checked = state.listening;
  element<HTMLMeterElement>('check-level').value = state.level;
  element<HTMLSelectElement>('quality').disabled = settingsBusy || busy;
  const status = state.capturing ? 'Waiting for camera and microphone permission…' : state.active ? state.listening ? 'Devices on · listening through your output device · use headphones.' : 'Devices on · speak to check the meter. Listening is off.' : 'Devices are off.';
  if (element('check-status').textContent !== status) element('check-status').textContent = status;
  element('check-error').textContent = state.error; show('check-error', !!state.error);
}
function applyUpdate(state: UpdateState): void {
  element('update-version').textContent = `Installed version ${state.currentVersion}`;
  element('update-status').textContent = state.message;
  if (state.status === 'checking' && settings.open) element('updates-title').scrollIntoView({ block: 'start' });
  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'installing';
  disabled('update-check', busy || state.status === 'ready');
  show('update-download', state.status === 'available');
  show('update-reveal', state.canReveal === true);
  show('update-install', state.status === 'ready');
  show('update-progress', state.status === 'downloading');
  element<HTMLProgressElement>('update-progress').value = state.percent ?? 0;
}
function openSettings(): void { show('settings-error', false); renderCheck(); if (!settings.open) settings.showModal(); }
function applyCalling(state: CallingState): void { calling = state; if (state.call && (check.state.active || check.state.capturing)) void check.stop('Device check stopped for the call.'); media.handleState(state); render(); }
const contactRows = new Map<string, { root: HTMLElement; input: HTMLInputElement; name: HTMLElement; status: HTMLElement; actions: HTMLButtonElement[] }>();
function selectedMembers(): string[] {
  return [...selected].filter(id => calling.members.some(m => m.id === id && m.online && id !== calling.selfId) && !calling.call?.members.some(m => m.id === id && (m.status === 'joined' || m.status === 'invited')));
}
function memberNames(ids: string[]): string { return ids.map(id => calling.members.find(m => m.id === id)?.name ?? 'Former member').join(', '); }
function renderContacts(): void {
  show('group', !!calling.role); show('member-management', calling.role === 'host');
  for (const [id, row] of contactRows) if (!calling.members.some(m => m.id === id)) { row.root.remove(); contactRows.delete(id); selected.delete(id); }
  const others = calling.members.filter(m => m.id !== calling.selfId);
  if (!selectionTouched && !calling.call && others.length === 1 && others[0].online) selected.add(others[0].id);
  for (const member of calling.members) {
    let row = contactRows.get(member.id);
    if (!row) {
      const root = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input'), name = document.createElement('span'), status = document.createElement('span');
      root.className = 'contact-row'; root.dataset.memberId = member.id; input.type = 'checkbox'; input.value = member.id; status.className = 'contact-status';
      input.addEventListener('change', () => { selectionTouched = true; if (input.checked) selected.add(member.id); else selected.delete(member.id); render(); });
      label.append(input, name); root.append(label, status); const actions: HTMLButtonElement[] = [];
      if (calling.role === 'host') {
        const button = (text: string, operation: () => Promise<void>) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', () => { void setup(operation); }); actions.push(b); root.append(b); };
        if (member.id !== calling.selfId) button('Copy invitation', async () => { await window.zoomtime.copyInvitation(member.id); element('toast').textContent = 'Invitation copied. It contains a secret; share it privately with this person only.'; });
        button('Rename', async () => { renamingId = member.id; element<HTMLInputElement>('rename-name').value = calling.members.find(m => m.id === member.id)?.name ?? ''; renameDialog.showModal(); });
        if (member.id !== calling.selfId) button('Revoke…', async () => { if (confirm(`Revoke ${calling.members.find(m => m.id === member.id)?.name ?? 'this member'} and remove them from the call?`)) await window.zoomtime.revokeMember(member.id); });
      }
      element('contacts').append(root); row = { root, input, name, status, actions }; contactRows.set(member.id, row);
    }
    const own = member.id === calling.selfId, membership = calling.call?.members.find(m => m.id === member.id);
    const unavailable = own || !member.online || membership?.status === 'joined' || membership?.status === 'invited' || calling.busy && !calling.call;
    if (unavailable) selected.delete(member.id);
    row.input.disabled = setupBusy || !!unavailable; row.input.checked = selected.has(member.id);
    row.name.textContent = `${member.name}${own ? ' · You' : ''}${member.id === calling.hostId ? ' · Host' : ''}`;
    row.input.setAttribute('aria-label', `Select ${member.name}`);
    row.status.textContent = !member.online ? 'Offline' : membership?.status === 'joined' ? 'Joined' : membership?.status === 'invited' ? 'Invited' : membership?.status === 'declined' ? 'Declined' : membership?.status === 'expired' ? 'Invitation expired' : membership?.status === 'left' ? 'Left' : 'Online';
    for (const button of row.actions) { button.disabled = setupBusy; button.setAttribute('aria-label', `${button.textContent?.replace('…', '')} · ${member.name}`); }
  }
  disabled('add-member', setupBusy || calling.members.length >= 5);
}
function render(): void {
  renderCheck(); renderContacts();
  disabled('rename-save', setupBusy); element('rename-error').textContent = uiError; show('rename-error', !!uiError);
  const state = media.state, call = calling.call, own = call?.members.find(m => m.id === calling.selfId);
  const incoming = own?.status === 'invited', active = own?.status === 'joined';
  const outgoing = active && call!.pairs.length === 0;
  const localActive = !!local.srcObject, targets = selectedMembers(), names = memberNames(targets);
  const ready = !!calling.role && calling.network.state === 'online' && !calling.busy && !call && targets.length > 0;
  const reconnecting = !!call && calling.network.state !== 'online';
  let status = !calling.role ? 'Pair your private group' : calling.network.state !== 'online' ? calling.network.message : !call ? calling.busy ? 'Call in progress · ask for an invitation' : 'Choose who to call' :
    incoming ? `Incoming call from ${memberNames([call!.callerId])}` : outgoing ? `Calling ${memberNames(call!.members.filter(m => m.status === 'invited').map(m => m.id))}…` : reconnecting ? 'Signaling reconnecting…' : state.connection === 'connected' ? 'Connected' : state.connection === 'degraded' ? 'Some connections interrupted' : 'Connecting media…';
  if (state.capturing) status = 'Waiting for camera/microphone…';
  document.body.dataset.paired = String(!!calling.role); document.body.dataset.online = String(calling.network.state === 'online');
  setText('status', status);
  show('onboarding', !calling.role); show('paired', !!calling.role || !!calling.error);
  element('pairing-status').textContent = calling.role === 'host' ? 'This Mac hosts your private group. Keep ZoomTime open for others after leaving a call.' : calling.role === 'guest' ? 'Paired with your private group.' : 'Secure pairing needs recovery.';
  for (const id of ['host', 'manual-host', 'import', 'reset']) disabled(id, setupBusy);
  disabled('retry', setupBusy || calling.role === 'host' && calling.busy);
  show('retry', calling.network.state !== 'online');
  element('host').textContent = setupBusy ? 'Setting up…' : 'Host on this Mac';
  show('call', !call && !state.capturing && !localActive); disabled('call', !ready || state.capturing); element('call').textContent = names ? `Call ${names}` : 'Select people to call';
  show('invite-members', !!active); disabled('invite-members', !targets.length || state.capturing); element('invite-members').textContent = names ? `Invite ${names}` : 'Select people to invite';
  show('accept', !!incoming && !state.capturing); show('reject', !!incoming && !state.capturing); show('cancel', !!outgoing || state.capturing || localActive && !call);
  for (const id of ['mute', 'camera', 'hangup']) show(id, !!active && !outgoing);
  for (const id of ['mute', 'camera', 'mini-mute', 'mini-camera']) disabled(id, !localActive || state.capturing);
  for (const id of ['mute', 'mini-mute']) {
    renderMediaButton(element<HTMLButtonElement>(id), 'microphone', state.muted);
  }
  for (const id of ['camera', 'mini-camera']) {
    renderMediaButton(element<HTMLButtonElement>(id), 'camera', !state.cameraOn);
  }
  const closeLabel = incoming ? 'Decline call' : call || state.capturing || localActive ? 'Leave call' : 'Close ZoomTime'; element('close').title = closeLabel; element('close').setAttribute('aria-label', closeLabel); element('close').dataset.participating = String(!!call || state.capturing || localActive);
  show('mini-people', !!calling.role);
  show('self-preview', localActive && state.cameraOn);
  const remoteJoined = call?.members.filter(m => m.id !== calling.selfId && m.status === 'joined').length ?? 0;
  show('empty', !remoteJoined); videos.render(calling.members, call, state);
  element('partner-title').textContent = state.capturing ? 'Waiting for permission…' : incoming ? `${memberNames([call!.callerId])} is calling.` : outgoing ? 'Calling…' : calling.busy ? 'Private call in progress' : 'Your private group.';
  element('partner-detail').textContent = incoming ? `In this call: ${memberNames(call!.members.filter(m => m.status === 'joined').map(m => m.id))}. Accept to share your camera and microphone.` : !calling.role ? 'Pair your Macs, then choose who to call.' : calling.busy && !call ? 'Ask a participant to invite you.' : 'Choose named members below. Everyone joins explicitly.';
  const peerError = Object.values(state.peers).find(p => p.error)?.error;
  const message = uiError || calling.error || state.error || peerError || ''; setText('error', message); show('error', !!message);
  setText('mini-status', message || status); element('mini-status').title = message || status;
  show('audio-only', state.audioOnlyOffered && !state.capturing); show('devices', !!active && !!state.error && !state.capturing);
  show('resume-audio', Object.values(state.peers).some(p => p.error === 'Click Resume audio to start participant playback.'));
  if (!call) connectedAt = null; else if (state.connection === 'connected' || state.connection === 'degraded') connectedAt ??= Date.now();
  element('statistics').textContent = JSON.stringify({ signaling: calling.network.state, call: call?.id ? state.connection : calling.role ? 'ready' : 'unpaired', ...state.stats,
    peers: Object.fromEntries(Object.entries(state.peers).map(([id, peer]) => [id.slice(0, 8), { connection: peer.connection, stale: peer.stale, ...peer.stats }])),
    ...(connectedAt ? { connectedSeconds: Math.floor((Date.now() - connectedAt) / 1000) } : {}) }, null, 2);
}
element('host').addEventListener('click', () => { void setup(async () => { element('toast').textContent = 'Opening Tailscale and preparing your private endpoint…'; await window.zoomtime.setupHost(); element('toast').textContent = 'Host ready. Add named members below, then copy each person’s private invitation.'; }); });
element('host-form').addEventListener('submit', event => { event.preventDefault(); void setup(() => window.zoomtime.createHost(element<HTMLInputElement>('endpoint').value.trim())); });
element('import').addEventListener('click', () => { void setup(() => window.zoomtime.importInvitation()); });
element('member-form').addEventListener('submit', event => { event.preventDefault(); void setup(async () => { await window.zoomtime.addMember(element<HTMLInputElement>('member-name').value); element<HTMLInputElement>('member-name').value = ''; }); });
element('mini-people').addEventListener('click', () => run(async () => { applyWindow(await window.zoomtime.restore()); element<HTMLDetailsElement>('call-menu').open = false; element('group').scrollIntoView({ block: 'start' }); element('group').focus(); }));
element('retry').addEventListener('click', () => { void setup(() => window.zoomtime.retryConnection()); });
element('reset').addEventListener('click', () => { if (!confirm(calling.role === 'host' ? 'Reset this group, end its call and revoke every pairing invitation?' : 'Forget this group and leave your call?')) return; media.stop(); void setup(() => window.zoomtime.resetPairing()); });
element('call').addEventListener('click', () => { action = { action: 'call', targetIds: selectedMembers() }; run(async () => { await check.stop(); await media.start(action!); }); });
element('accept').addEventListener('click', () => { const call = calling.call, own = call?.members.find(m => m.id === calling.selfId); if (!call || !own?.invitationId) return; action = { action: 'accept', callId: call.id, invitationId: own.invitationId }; run(async () => { await check.stop(); await media.start(action!); }); });
element('invite-members').addEventListener('click', () => run(async () => { if (calling.call) await window.zoomtime.sendSignal({ v: 2, type: 'invite', callId: calling.call.id, targetIds: selectedMembers() }); }));
element('audio-only').addEventListener('click', () => run(() => action ? media.start(action, true) : Promise.resolve()));
for (const id of ['reject', 'cancel', 'hangup']) element(id).addEventListener('click', () => media.hangup());
for (const id of ['mute', 'mini-mute']) element(id).addEventListener('click', () => media.toggleMute());
for (const id of ['camera', 'mini-camera']) element(id).addEventListener('click', () => run(() => media.toggleCamera()));
element('devices').addEventListener('click', () => run(() => media.retryDevices()));
element('resume-audio').addEventListener('click', () => run(async () => { await media.resumeAudio(); render(); }));
element('mini').addEventListener('click', () => run(() => window.zoomtime.setMode('mini').then(applyWindow)));
element('restore').addEventListener('click', () => run(() => window.zoomtime.restore().then(applyWindow)));
element('close').addEventListener('click', () => { if (calling.call || media.state.capturing || local.srcObject) media.hangup(); else run(() => window.zoomtime.close()); });
element('minimize-window').addEventListener('click', () => run(() => window.zoomtime.minimize()));
element('open-settings').addEventListener('click', openSettings);
element('update-check').addEventListener('click', () => run(() => window.zoomtime.checkForUpdates()));
element('update-download').addEventListener('click', () => run(() => window.zoomtime.downloadUpdate()));
element('update-install').addEventListener('click', () => run(() => window.zoomtime.installUpdate()));
element('update-reveal').addEventListener('click', () => run(() => window.zoomtime.revealUpdate()));
window.zoomtime.onUpdateState(applyUpdate);
settings.addEventListener('close', () => { if (!settings.open) void check.stop(); });
settings.addEventListener('cancel', () => { void check.stop(); });
element('check-start').addEventListener('click', () => { void check.start(preferences.quality, preferences.speakerEchoReduction); });
element('check-stop').addEventListener('click', () => { void check.stop(); });
element('check-listen').addEventListener('change', () => { void check.listen(element<HTMLInputElement>('check-listen').checked); });
element('settings-close').addEventListener('click', () => { void check.stop(); settings.close(); });
element('output-volume').addEventListener('input', () => { const value = Number(element<HTMLInputElement>('output-volume').value); outputVolumeDraft = value; videos.setOutputVolume(value); element('output-volume-value').textContent = `${value}%`; });
element('output-volume').addEventListener('change', () => { void updatePreferences({ outputVolume: Number(element<HTMLInputElement>('output-volume').value) }).finally(() => { outputVolumeDraft = null; applyPreferences(); }); });
element('mirror').addEventListener('change', () => { void updatePreferences({ mirror: element<HTMLInputElement>('mirror').checked }); });
element('speaker-echo-reduction').addEventListener('change', () => { speakerEchoDraft = element<HTMLInputElement>('speaker-echo-reduction').checked; void updatePreferences({ speakerEchoReduction: speakerEchoDraft }).finally(() => { speakerEchoDraft = null; applyPreferences(); }); });
element('normal-always-on-top').addEventListener('change', () => { void updatePreferences({ normalAlwaysOnTop: element<HTMLInputElement>('normal-always-on-top').checked }); });
element('mini-always-on-top').addEventListener('change', () => { void updatePreferences({ miniAlwaysOnTop: element<HTMLInputElement>('mini-always-on-top').checked }); });
element('mini-self-setting').addEventListener('change', () => { void updatePreferences({ miniSelf: element<HTMLInputElement>('mini-self-setting').checked }); });
element('mini-self').addEventListener('click', () => { void updatePreferences({ miniSelf: !preferences.miniSelf }); });
element('quality').addEventListener('change', () => { void updatePreferences({ quality: element<HTMLSelectElement>('quality').value as VideoQuality }); });
element('preview-size').addEventListener('input', () => { selfPreview.style.width = `${element<HTMLInputElement>('preview-size').value}%`; });
element('preview-size').addEventListener('change', () => { void updatePreferences({ previewSize: Number(element<HTMLInputElement>('preview-size').value) }); });
selfPreview.addEventListener('pointerdown', () => { resizingPreview = true; });
window.addEventListener('pointerup', () => { resizingPreview = false; });
// Persist a user resize as a fraction so it scales with either window mode.
new ResizeObserver(() => {
  if (!resizingPreview || !selfPreview.offsetWidth || settingsBusy) return;
  const percent = Math.round(selfPreview.offsetWidth / selfPreview.parentElement!.clientWidth * 100);
  if (percent < 18 || percent > 45 || Math.abs(percent - preferences.previewSize) < 2) return;
  clearTimeout(preferencesTimer);
  preferencesTimer = setTimeout(() => { void updatePreferences({ previewSize: percent }); }, 300);
}).observe(selfPreview);
window.zoomtime.onSettings(openSettings);
document.addEventListener('keydown', event => {
  if (settings.open || renameDialog.open) return;
  if (event.key === 'Escape' && element<HTMLDetailsElement>('call-menu').open) { event.preventDefault(); element<HTMLDetailsElement>('call-menu').open = false; element<HTMLElement>('call-menu').querySelector('summary')!.focus(); return; }
  if (event.key === 'Escape') {
    if (windowState?.mode === 'mini') { event.preventDefault(); run(() => window.zoomtime.restore().then(applyWindow)); }
    else if (windowState?.fullScreen) { event.preventDefault(); run(() => window.zoomtime.setFullScreen(false).then(applyWindow)); }
  }
});
document.addEventListener('pointerdown', event => { const menu = element<HTMLDetailsElement>('call-menu'); if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false; });
window.addEventListener('beforeunload', () => { void check.stop(); media.stop(); });
window.zoomtime.onState(applyWindow);
window.zoomtime.onCallEvent(event => { if (event.type === 'state') applyCalling(event.state); else if (event.type === 'stop') { if (check.state.active || check.state.capturing) void check.stop(event.reason); media.stop(event.reason); } else if (event.type === 'check-stop') void check.stop(event.reason); else void media.handleSignal(event.message); });
run(async () => { applyWindow(await window.zoomtime.getState()); applyCalling(await window.zoomtime.getCallingState()); applyUpdate(await window.zoomtime.getUpdateState()); });
setInterval(() => { const seconds = Math.floor((Date.now() - startedAt) / 1000); element('elapsed').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }, 1000);
setupScreenCapture();
render();

element('rename-form').addEventListener('submit', event => { event.preventDefault(); if (renamingId) void setup(async () => { await window.zoomtime.renameMember(renamingId!, element<HTMLInputElement>('rename-name').value); renameDialog.close(); renamingId = null; }); });
element('rename-cancel').addEventListener('click', () => renameDialog.close());
renameDialog.addEventListener('close', () => { if (!renameDialog.open) renamingId = null; });
