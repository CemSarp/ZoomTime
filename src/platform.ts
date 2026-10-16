export function requireAppleSilicon(arch: string): void {
  if (arch !== 'arm64') throw new Error('Apple Silicon (arm64) is required. Intel Macs and running under Rosetta are no longer supported.');
}
