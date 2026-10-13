export type WindowMode = 'normal' | 'mini';
export interface Bounds { x: number; y: number; width: number; height: number }
export interface SavedBounds { version: 1; normal: Bounds | null; mini: Bounds | null }
export function clampBounds(bounds: Bounds, areas: Bounds[], mode: WindowMode): Bounds {
  if (areas.length === 0) throw new Error('No available display');
  const overlap = (area: Bounds): number =>
    Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)) *
    Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
  const area = areas.reduce((best, candidate) => overlap(candidate) > overlap(best) ? candidate : best);
  const width = Math.min(area.width, Math.max(mode === 'mini' ? 160 : 640, Math.round(bounds.width)));
  const height = Math.min(area.height, Math.max(mode === 'mini' ? 90 : 420, Math.round(bounds.height)));
  return { x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))), width, height };
}
export function defaultBounds(mode: WindowMode, area: Bounds): Bounds {
  const width = mode === 'mini' ? 320 : 900;
  const height = mode === 'mini' ? 180 : 600;
  return clampBounds({ x: Math.round(area.x + (mode === 'mini' ? area.width - width - 32 : (area.width - width) / 2)),
    y: Math.round(area.y + (mode === 'mini' ? area.height - height - 32 : (area.height - height) / 2)),
    width, height }, [area], mode);
}
export function decodeBounds(value: unknown): SavedBounds {
  const empty: SavedBounds = { version: 1, normal: null, mini: null };
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return empty;
  const parse = (input: unknown): Bounds | null => {
    if (!input || typeof input !== 'object') return null;
    const b = input as Record<string, unknown>;
    if (!['x', 'y', 'width', 'height'].every(key => typeof b[key] === 'number' &&
      Number.isFinite(b[key]) && Math.abs(b[key] as number) <= 100_000) ||
      (b.width as number) <= 0 || (b.height as number) <= 0) return null;
    return { x: Math.round(b.x as number), y: Math.round(b.y as number),
      width: Math.max(1, Math.round(b.width as number)), height: Math.max(1, Math.round(b.height as number)) };
  };
  const data = value as Record<string, unknown>;
  return { version: 1, normal: parse(data.normal), mini: parse(data.mini) };
}
