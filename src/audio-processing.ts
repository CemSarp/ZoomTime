export type SpeakerEchoStatus = 'standard' | 'all' | 'unavailable';
export function microphoneConstraints(experimental: boolean): MediaTrackConstraints {
  return { echoCancellation: experimental ? { ideal: 'all' } : true, noiseSuppression: true, autoGainControl: true };
}
export function speakerEchoStatus(track: Pick<MediaStreamTrack, 'getSettings'>, experimental: boolean): SpeakerEchoStatus {
  if (!experimental) return 'standard';
  return track.getSettings().echoCancellation === 'all' ? 'all' : 'unavailable';
}
