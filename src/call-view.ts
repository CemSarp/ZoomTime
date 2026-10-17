import type { CallSnapshot, Member } from './protocol.ts';
import type { MediaState } from './media-call.ts';
import type { MediaPeerState } from './media-peer.ts';
export class ActiveSpeaker {
  private active: string | null = null;
  private candidate: string | null = null;
  private samples = 0;
  private sampledAt = -Infinity;
  private voicedAt = 0;
  sample(peers: Record<string, MediaPeerState>, now: number): string | null {
    const eligible = (p: MediaPeerState | undefined) => p?.connection === 'connected' && !p.stale && p.audioLevel !== null;
    if (this.active && !eligible(peers[this.active])) this.active = null;
    if (now - this.sampledAt < 500) return this.active;
    this.sampledAt = now;
    let winner: string | null = null, level = 0.02;
    for (const [id, peer] of Object.entries(peers)) if (eligible(peer) && peer.audioLevel! > level) { winner = id; level = peer.audioLevel!; }
    if (winner && winner === this.candidate) this.samples++; else { this.candidate = winner; this.samples = winner ? 1 : 0; }
    if (winner && this.samples >= 2) { this.active = winner; this.voicedAt = now; }
    else if (this.active && peers[this.active].audioLevel! > 0.02) this.voicedAt = now;
    if (this.active && now - this.voicedAt >= 1000) this.active = null;
    return this.active;
  }
}
interface Tile { root: HTMLElement; video: HTMLVideoElement; name: HTMLElement; status: HTMLElement; pin: HTMLButtonElement }
export class GroupVideoView {
  private root: HTMLElement;
  private select: HTMLSelectElement;
  private tiles = new Map<string, Tile>();
  private pinned: string | null = null;
  private speaker = new ActiveSpeaker();
  private optionKey = '';
  private changed: () => void;
  constructor(root: HTMLElement, select: HTMLSelectElement, changed: () => void) {
    this.root = root; this.select = select; this.changed = changed;
    select.addEventListener('change', () => this.pin(select.value || null));
  }
  remote(id: string): HTMLVideoElement {
    let tile = this.tiles.get(id); if (tile) return tile.video;
    const root = document.createElement('article'), video = document.createElement('video'), name = document.createElement('span'), status = document.createElement('p'), pin = document.createElement('button');
    root.className = 'video-tile'; root.dataset.participantId = id;
    video.autoplay = true; video.playsInline = true; video.disablePictureInPicture = true; video.muted = false;
    video.addEventListener('loadeddata', this.changed);
    name.className = 'participant-name'; status.className = 'tile-status'; pin.type = 'button'; pin.className = 'pin-person'; pin.textContent = 'Pin';
    pin.addEventListener('click', () => this.pin(this.pinned === id ? null : id));
    root.append(video, status, name, pin); this.root.append(root); tile = { root, video, name, status, pin }; this.tiles.set(id, tile); this.layout(); return video;
  }
  remove(id: string): void {
    this.tiles.get(id)?.root.remove(); this.tiles.delete(id); if (this.pinned === id) this.pinned = null; this.layout();
  }
  pin(id: string | null): void { this.pinned = id && this.tiles.has(id) ? id : null; this.layout(); }
  private layout(): void {
    this.root.dataset.count = String(this.tiles.size); this.root.dataset.pinned = String(!!this.pinned); this.select.value = this.pinned ?? '';
    for (const [id, tile] of this.tiles) {
      const focused = this.pinned === id, hidden = !!this.pinned && !focused;
      tile.root.dataset.pinned = String(focused); tile.root.inert = hidden; tile.root.setAttribute('aria-hidden', String(hidden));
      tile.pin.setAttribute('aria-pressed', String(focused)); tile.pin.textContent = focused ? 'Grid' : 'Pin';
    }
  }
  render(members: Member[], call: CallSnapshot | null, state: MediaState): void {
    const levels: Record<string, MediaPeerState> = {};
    for (const [id, tile] of this.tiles) {
      const member = members.find(m => m.id === id), membership = call?.members.find(m => m.id === id), peer = state.peers[id];
      const name = member?.name ?? 'Participant'; tile.name.textContent = `${name}${membership?.media.audio ? '' : ' · muted'}`;
      tile.video.setAttribute('aria-label', `${name} video`); tile.pin.setAttribute('aria-label', this.pinned === id ? 'Return to the grid' : `Pin ${name}`);
      const visible = peer?.connection === 'connected' && !peer.stale && membership?.media.video && tile.video.readyState >= 2;
      tile.root.dataset.live = String(!!visible); tile.status.hidden = !!visible;
      tile.status.textContent = peer?.connection === 'failed' ? 'Connection failed' : peer?.stale ? 'Video interrupted' : peer?.connection !== 'connected' ? 'Connecting…' : !membership?.media.video ? 'Camera off' : 'Waiting for video…';
      if (peer && membership?.status === 'joined' && membership.media.audio) levels[id] = peer;
    }
    const active = this.speaker.sample(levels, Date.now());
    for (const [id, tile] of this.tiles) { tile.root.dataset.speaking = String(id === active); tile.root.setAttribute('aria-label', `${members.find(m => m.id === id)?.name ?? 'Participant'}${id === active ? ' speaking' : ''}`); }
    const key = JSON.stringify([...this.tiles.keys()].map(id => [id, members.find(m => m.id === id)?.name]));
    if (key !== this.optionKey) {
      this.optionKey = key; const all = document.createElement('option'); all.value = ''; all.textContent = 'Show everyone';
      const options = [...this.tiles.keys()].map(id => { const option = document.createElement('option'); option.value = id; option.textContent = `Pin ${members.find(m => m.id === id)?.name ?? 'participant'}`; return option; });
      this.select.replaceChildren(all, ...options); this.select.value = this.pinned ?? '';
    }
    this.select.disabled = this.tiles.size < 2;
  }
}
