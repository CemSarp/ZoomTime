import { randomBytes } from 'node:crypto';
import type { HostPairing } from '../src/pairing.ts';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const hostFixture = (count = 5): HostPairing => ({ v: 2, role: 'host', endpoint: 'wss://mac.tail.ts.net:8443/zoomtime', groupId: id(90), hostId: id(1), members: Array.from({ length: count }, (_, i) => ({ id: id(i + 1), name: i ? `Person ${i + 1}` : 'Host', token: randomBytes(32).toString('base64url') })) });
export const waitFor = async (predicate: () => boolean, label = 'Timed out', timeout = 2500) => {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() >= end) throw new Error(label); await new Promise(resolve => setTimeout(resolve, 5)); }
};
