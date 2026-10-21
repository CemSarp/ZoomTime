import { microphoneConstraints, requestMicrophone, speakerEchoStatus, type SpeakerEchoStatus } from './audio-processing.ts';
import { videoConstraints, type VideoQuality } from './preferences.ts';
export interface DeviceCheckState { active: boolean; speakerEcho: SpeakerEchoStatus; capturing: boolean; listening: boolean; level: number; error: string }
interface CheckBridge { authorizeDeviceCheck(): Promise<void>; releaseDeviceCheck(): Promise<void> }
export class DeviceCheck {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private monitor: GainNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private speakerEchoReduction = false;
  private epoch = 0;
  private listenRequest = 0;
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private value: DeviceCheckState = { active: false, speakerEcho: 'standard', capturing: false, listening: false, level: 0, error: '' };
  constructor(private bridge: CheckBridge, private video: HTMLVideoElement, private changed: (state: DeviceCheckState) => void) {}
  get state(): DeviceCheckState { return { ...this.value }; }
  async setSpeakerEchoReduction(enabled: boolean): Promise<void> {
    if (enabled === this.speakerEchoReduction) return;
    if (!this.stream) { this.speakerEchoReduction = enabled; return; }
    if (this.value.capturing) throw new Error('Wait for the device check microphone operation to finish.');
    const epoch = this.epoch, context = this.context!, analyser = this.analyser!, previousSetting = this.speakerEchoReduction;
    this.speakerEchoReduction = enabled; this.value.capturing = true; this.changed(this.state);
    let acquired: MediaStream | null = null;
    try {
      acquired = await requestMicrophone(enabled, this.stream!.getAudioTracks()[0]); if (epoch !== this.epoch) return;
      const microphone = acquired.getAudioTracks()[0], source = context.createMediaStreamSource(acquired);
      source.connect(analyser); this.source?.disconnect(); this.source = source;
      for (const track of this.stream!.getAudioTracks()) { this.stream!.removeTrack(track); track.stop(); }
      this.stream!.addTrack(microphone); acquired = null;
      microphone.onended = () => { void this.stop('A device disconnected. Start a new check to retry.'); };
      this.value.speakerEcho = speakerEchoStatus(microphone, enabled);
    } catch {
      if (epoch === this.epoch) { this.speakerEchoReduction = previousSetting; throw new Error('Speaker echo reduction could not change. Your current device check is kept.'); }
    } finally { acquired?.getTracks().forEach(track => track.stop()); if (epoch === this.epoch) { this.value.capturing = false; this.changed(this.state); } }
  }
  async start(quality: VideoQuality, speakerEchoReduction = false): Promise<void> {
    if (this.value.active || this.value.capturing) return;
    this.speakerEchoReduction = speakerEchoReduction;
    const epoch = ++this.epoch;
    this.value = { active: false, speakerEcho: 'standard', capturing: true, listening: false, level: 0, error: '' }; this.changed(this.state);
    this.timer = setTimeout(() => { void this.stop('Device check stopped after two minutes.'); }, 120_000);
    try {
      await this.bridge.authorizeDeviceCheck(); if (epoch !== this.epoch) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(quality),
        audio: microphoneConstraints(speakerEchoReduction) });
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) throw new Error('Missing device');
      const speakerEcho = speakerEchoStatus(stream.getAudioTracks()[0], speakerEchoReduction);
      this.value.speakerEcho = speakerEcho;
      for (const track of stream.getTracks()) track.onended = () => { void this.stop('A device disconnected. Start a new check to retry.'); };
      this.video.muted = true; this.video.srcObject = stream;
      const context = new AudioContext(); this.context = context;
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser(); analyser.fftSize = 256;
      this.source = source; this.analyser = analyser;
      this.monitor = context.createGain(); this.monitor.gain.value = 0;
      source.connect(analyser); analyser.connect(this.monitor); this.monitor.connect(context.destination);
      // A zero-gain output keeps Chromium’s meter running without playing the microphone.
      await context.resume(); if (epoch !== this.epoch) return;
      await this.video.play(); if (epoch !== this.epoch) return;
      this.value.active = true; this.value.capturing = false;
      const samples = new Uint8Array(analyser.fftSize);
      const meter = () => {
        if (epoch !== this.epoch) return;
        analyser.getByteTimeDomainData(samples);
        this.value.level = Math.min(100, Math.round(Math.sqrt(samples.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / samples.length) * 140));
        this.changed(this.state); this.frame = requestAnimationFrame(meter);
      };
      meter();
    } catch {
      if (epoch === this.epoch) await this.stop('Camera/microphone check failed. Check macOS camera and microphone permissions, close other camera apps, then retry.');
    }
  }
  async listen(enabled: boolean): Promise<void> {
    const context = this.context, monitor = this.monitor, epoch = this.epoch, request = ++this.listenRequest;
    if (!this.value.active || !context || !monitor) return;
    try {
      if (enabled) { await context.resume(); if (epoch !== this.epoch || request !== this.listenRequest) return; }
      monitor.gain.value = enabled ? 0.6 : 0;
      this.value.listening = enabled; this.changed(this.state);
    } catch { if (epoch === this.epoch && request === this.listenRequest) await this.stop('Audio monitoring could not start. Check your macOS output device and retry.'); }
  }
  async stop(reason = ''): Promise<void> {
    this.epoch++; clearTimeout(this.timer); cancelAnimationFrame(this.frame);
    this.timer = undefined; this.frame = 0;
    this.monitor?.disconnect(); this.monitor = null;
    this.source?.disconnect(); this.source = null; this.analyser = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    const context = this.context; this.context = null;
    this.video.pause(); this.video.srcObject = null;
    this.value = { active: false, speakerEcho: 'standard', capturing: false, listening: false, level: 0, error: reason }; this.changed(this.state);
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    await this.bridge.releaseDeviceCheck().catch(() => {});
  }
}
