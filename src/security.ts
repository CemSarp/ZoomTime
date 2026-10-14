export function isTrustedIpc(url: string, expected: string, mainFrame: boolean): boolean {
  return mainFrame && url === expected;
}
export function isWindowMode(value: unknown): value is 'normal' | 'mini' {
  return value === 'normal' || value === 'mini';
}
export function assetPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'zoomtime:' || parsed.host !== 'app' || parsed.username || parsed.password ||
      parsed.search || parsed.hash) return null;
    const path = parsed.pathname.slice(1);
    return ['main_window/index.html', 'main_window/index.js', 'main_window/index.css'].includes(path) ? path : null;
  } catch { return null; }
}

export const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
export const PROBE_PERMISSIONS_POLICY = 'camera=(), microphone=(), display-capture=()';
export const CALL_PERMISSIONS_POLICY = 'camera=(self), microphone=(self), display-capture=()';
export function allowCallMedia(permission: string, url: string, expected: string, mainFrame: boolean, authorized: boolean, types: string[]): boolean {
  return authorized && isTrustedIpc(url, expected, mainFrame) && permission === 'media' && types.length > 0 && types.every(type => type === 'audio' || type === 'video');
}
