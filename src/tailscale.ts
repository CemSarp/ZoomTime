import { approvedEndpoint } from './protocol.ts';
type Command = (args: string[]) => Promise<string>;
const proxy = 'http://127.0.0.1:47831';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tailscale returned an unsupported configuration. Open Tailscale and retry.');
  return value as Record<string, unknown>;
}
function inspect(config: Record<string, unknown>, key: string): boolean {
  for (const foreground of Object.values(object(config.Foreground ?? {}))) {
    const entry = object(foreground);
    if (object(entry.TCP ?? {})['8443'] || Object.keys(object(entry.Web ?? {})).some(name => name.endsWith(':8443'))) throw new Error('Port 8443 is used by a foreground Tailscale service. ZoomTime left it unchanged.');
  }
  const tcp = object(config.TCP ?? {}), web = object(config.Web ?? {}), funnel = object(config.AllowFunnel ?? {});
  if (Object.entries(funnel).some(([name, enabled]) => name.endsWith(':8443') && enabled)) throw new Error('Port 8443 has Funnel enabled. Disable public access in Tailscale before using ZoomTime.');
  const entries = Object.entries(web).filter(([name]) => name.endsWith(':8443'));
  if (!tcp['8443'] && entries.length === 0) return false;
  const entry = entries.length === 1 ? object(entries[0][1]) : {};
  const handlers = object(entry.Handlers ?? {}), root = object(handlers['/'] ?? {});
  const owned = entries.length === 1 && entries[0][0] === key && Object.keys(entry).length === 1 &&
    Object.keys(handlers).length === 1 && root.Proxy === proxy && Object.keys(root).length === 1;
  const listener = object(tcp['8443'] ?? {});
  if (!owned || listener.HTTPS !== true || Object.keys(listener).some(name => name !== 'HTTPS')) throw new Error('Port 8443 already has a different service or an old hostname. ZoomTime left it unchanged. Review Tailscale Serve before retrying.');
  return true;
}
function parse(text: string): Record<string, unknown> {
  try { return object(JSON.parse(text)); } catch { throw new Error('Tailscale returned an unsupported status. Open Tailscale and retry.'); }
}
export async function setupTailscaleHost(command: Command): Promise<string> {
  const status = parse(await command(['status', '--json']));
  const self = object(status.Self ?? {});
  if (status.BackendState !== 'Running' || self.Online !== true) throw new Error('Connect Tailscale and sign in in its window, then press Host again.');
  const hostname = typeof self.DNSName === 'string' ? self.DNSName.replace(/\.$/, '') : '';
  const endpoint = approvedEndpoint(`wss://${hostname}:8443/zoomtime`);
  if (!endpoint) throw new Error('Tailscale has no valid private hostname. Enable MagicDNS in your tailnet and retry.');
  if (!Array.isArray(status.CertDomains) || !status.CertDomains.includes(hostname)) throw new Error('Enable HTTPS certificates in your Tailscale admin DNS settings, then press Host again.');
  const key = `${hostname}:8443`;
  const config = parse(await command(['serve', 'status', '--json']));
  if (!inspect(config, key)) {
    // Recheck before mutation so another service configured during setup is never overwritten.
    const fresh = parse(await command(['serve', 'status', '--json']));
    if (JSON.stringify(config) !== JSON.stringify(fresh)) throw new Error('Tailscale configuration changed during setup. Retry Host.');
    await command(['serve', '--bg', '--https=8443', proxy]);
    if (!inspect(parse(await command(['serve', 'status', '--json'])), key)) throw new Error('Tailscale did not confirm the private endpoint. Open Tailscale and retry.');
  }
  return endpoint;
}
