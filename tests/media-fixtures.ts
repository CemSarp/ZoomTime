import type { TestContext } from 'node:test';
export class FakeTrack {
  kind: string; enabled = true; readyState = 'live'; onended: (() => void) | null = null;
  constructor(kind: string) { this.kind = kind; }
  stop() { this.readyState = 'ended'; }
  getSettings() { return this.kind === 'video' ? { width: 1280, height: 720, frameRate: 30 } : { echoCancellation: true }; }
  getCapabilities() { return {}; }
  async applyConstraints() {}
}
export class FakeStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  addTrack(track: FakeTrack) { this.tracks.push(track); }
  removeTrack(track: FakeTrack) { this.tracks = this.tracks.filter(t => t !== track); }
}
export class FakeVideo {
  srcObject: FakeStream | null = null; muted = false; readyState = 2; videoHeight = 720; paused = false;
  async play() { this.paused = false; }
  pause() { this.paused = true; }
}
export class FakePeer {
  static instances: FakePeer[] = [];
  connectionState = 'new'; iceConnectionState = 'new'; localDescription: RTCSessionDescriptionInit | null = null; remoteDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: { track: FakeTrack }) => void) | null = null; onicecandidate: ((event: { candidate: null }) => void) | null = null; onconnectionstatechange: (() => void) | null = null;
  failReplacement = false; report = new Map<string, Record<string, unknown>>();
  transceivers: { direction: string; sender: { track: FakeTrack | null; replaceTrack(track: FakeTrack | null): Promise<void>; setStreams(...streams: unknown[]): void }; receiver: { track: FakeTrack } }[] = [];
  constructor(_config: unknown) { FakePeer.instances.push(this); }
  addTransceiver(kind: string) {
    const sender={track:null as FakeTrack|null,replaceTrack:async(track:FakeTrack|null)=>{if(this.failReplacement)throw Error('replace failed');sender.track=track;},setStreams(..._streams:unknown[]){}};
    const t={direction:'sendrecv',sender,receiver:{track:new FakeTrack(kind)}};this.transceivers.push(t);return t;
  }
  getSenders() { return this.transceivers.map(t=>t.sender); }
  getTransceivers() { return this.transceivers; }
  async createOffer(_options?:unknown) { return {type:'offer',sdp:'v=0\r\na=ice-ufrag:local\r\n'}; }
  async createAnswer() { return {type:'answer',sdp:'v=0\r\na=ice-ufrag:local\r\n'}; }
  async setLocalDescription(d:RTCSessionDescriptionInit) { this.localDescription=d; }
  async setRemoteDescription(d:RTCSessionDescriptionInit) { this.remoteDescription=d;if(d.type==='offer'&&!this.transceivers.length)for(const kind of ['audio','video'])this.addTransceiver(kind); }
  async addIceCandidate(_candidate:unknown) {}
  async getStats() { return this.report; }
  close() { this.connectionState='closed'; }
}
export function mediaEnvironment(context:TestContext) {
  FakePeer.instances=[];const captured:FakeTrack[]=[];let acquisitions=0;
  const devices={addEventListener(){},async getUserMedia(constraints:MediaStreamConstraints){acquisitions++;const tracks=[...(constraints.audio?[new FakeTrack('audio')]:[]),...(constraints.video?[new FakeTrack('video')]:[])];captured.push(...tracks);return new FakeStream(tracks);}};
  for(const [name,value]of Object.entries({navigator:{mediaDevices:devices},MediaStream:FakeStream,RTCPeerConnection:FakePeer})){
    const previous=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
    context.after(()=>{if(previous)Object.defineProperty(globalThis,name,previous);else Reflect.deleteProperty(globalThis,name);});
  }
  return {devices,captured,acquisitions:()=>acquisitions,local:new FakeVideo(),remotes:new Map<string,FakeVideo>()};
}
export const drain = async () => { for(let i=0;i<12;i++)await new Promise<void>(resolve=>setImmediate(resolve)); };
