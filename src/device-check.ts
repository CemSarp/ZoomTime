import { videoConstraints, type VideoQuality } from './preferences.ts';
export interface DeviceCheckState { active: boolean; capturing: boolean; listening: boolean; level: number; error: string }
interface CheckBridge { authorizeDeviceCheck(): Promise<void>; releaseDeviceCheck(): Promise<void> }
export class DeviceCheck {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private monitor: GainNode | null = null;
  private epoch = 0;
  private listenRequest = 0;
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private value: DeviceCheckState = { active: false, capturing: false, listening: false, level: 0, error: '' };
  constructor(private bridge: CheckBridge, private video: HTMLVideoElement, private changed: (state: DeviceCheckState) => void) {}
  get state(): DeviceCheckState { return { ...this.value }; }
  async start(quality: VideoQuality): Promise<void> {
    if (this.value.active || this.value.capturing) return;
    const epoch = ++this.epoch;
    this.value = { active: false, capturing: true, listening: false, level: 0, error: '' }; this.changed(this.state);
    this.timer = setTimeout(() => { void this.stop('Device check stopped after two minutes.'); }, 120_000);
    try {
      await this.bridge.authorizeDeviceCheck(); if (epoch !== this.epoch) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(quality),
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) throw new Error('Missing device');
      for (const track of stream.getTracks()) track.onended = () => { void this.stop('A device disconnected. Start a new check to retry.'); };
      this.video.muted = true; this.video.srcObject = stream;
      const context = new AudioContext(); this.context = context;
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser(); analyser.fftSize = 256;
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
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    const context = this.context; this.context = null;
    this.video.pause(); this.video.srcObject = null;
    this.value = { active: false, capturing: false, listening: false, level: 0, error: reason }; this.changed(this.state);
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    await this.bridge.releaseDeviceCheck().catch(() => {});
  }
}
