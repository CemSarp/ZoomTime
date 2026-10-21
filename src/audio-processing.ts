export type SpeakerEchoStatus = 'standard' | 'all' | 'unavailable';
export function microphoneConstraints(enabled: boolean): MediaTrackConstraints {
  return { echoCancellation: { ideal: enabled ? 'all' : 'remote-only' }, noiseSuppression: true, autoGainControl: true };
}
export function speakerEchoStatus(track: Pick<MediaStreamTrack, 'getSettings'>, enabled: boolean): SpeakerEchoStatus {
  if (!enabled) return 'standard';
  return track.getSettings().echoCancellation === 'all' ? 'all' : 'unavailable';
}
export async function requestMicrophone(enabled: boolean, current: Pick<MediaStreamTrack, 'getCapabilities'>): Promise<MediaStream> {
  let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const audio = microphoneConstraints(enabled), mode = enabled ? 'all' : 'remote-only';
  if (current.getCapabilities().echoCancellation?.includes(mode)) audio.echoCancellation = { exact: mode };
  const capture = navigator.mediaDevices.getUserMedia({ audio, video: false }).then(stream => {
    if (expired || !stream.getAudioTracks().length || !enabled && stream.getAudioTracks()[0].getSettings().echoCancellation === 'all') {
      stream.getTracks().forEach(track => track.stop()); throw new Error('Microphone mode could not change.');
    }
    return stream;
  });
  try {
    // Optional audio changes must not time out the established call or leak late tracks.
    return await Promise.race([capture, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Microphone change timed out.')), 60_000); })]);
  } finally { expired = true; clearTimeout(timer); }
}
