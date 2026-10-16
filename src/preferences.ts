export type VideoQuality = '360p' | '720p' | '1080p';
export interface Preferences { mirror: boolean; miniSelf: boolean; quality: VideoQuality; previewSize: number; normalAlwaysOnTop: boolean; miniAlwaysOnTop: boolean; speakerEchoReduction: boolean }
export function decodePreferences(value: unknown): Preferences {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { speakerEchoReduction: typeof p.speakerEchoReduction === 'boolean' ? p.speakerEchoReduction : false,
    normalAlwaysOnTop: typeof p.normalAlwaysOnTop === 'boolean' ? p.normalAlwaysOnTop : false,
    miniAlwaysOnTop: typeof p.miniAlwaysOnTop === 'boolean' ? p.miniAlwaysOnTop : true,
    mirror: typeof p.mirror === 'boolean' ? p.mirror : true,
    miniSelf: typeof p.miniSelf === 'boolean' ? p.miniSelf : false,
    quality: p.quality === '360p' || p.quality === '1080p' ? p.quality : '720p',
    previewSize: typeof p.previewSize === 'number' && Number.isFinite(p.previewSize) ? Math.round(Math.min(45, Math.max(18, p.previewSize))) : 24 };
}
export function videoConstraints(quality: VideoQuality): MediaTrackConstraints {
  const [width, height, fps] = quality === '1080p' ? [1920, 1080, 30] : quality === '720p' ? [1280, 720, 30] : [640, 360, 24];
  return { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps, max: fps } };
}
