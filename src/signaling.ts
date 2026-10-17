import { Coordinator } from './coordinator.ts';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, parseClientMessage, validToken } from './protocol.ts';
import { validateHost, type HostPairing } from './pairing.ts';

export async function startSignaling(pairing: HostPairing, port = 47831) {
  if (!validateHost(pairing)) throw new Error('Invalid host credentials');
  let current = structuredClone(pairing);
  const coordinator = new Coordinator(current.groupId, current.hostId, current.members);
  const traffic = new Map<string, Map<string, number[]>>();
  const authenticated = new Map<WebSocket, string>();
  const server = createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, (_request, response) => { response.writeHead(404); response.end(); });
  server.maxConnections = 16;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number) => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (request.url !== '/zoomtime') { reject(404); return; }
    if (request.headers.origin) { reject(403); return; }
    if (request.headers['x-zoomtime-protocol'] !== '2') { reject(426); return; }
    const credential = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!validToken(credential)) { reject(401); return; }
    const bytes = Buffer.from(credential, 'base64url');
    let id: string | null = null;
    for (const member of current.members) if (timingSafeEqual(bytes, Buffer.from(member.token, 'base64url'))) id = member.id;
    if (!id) { reject(401); return; }
    if (coordinator.isOnline(id)) { reject(409); return; }
    const participantId = id;
    sockets.handleUpgrade(request, socket, head, ws => {
      let missed = 0;
      const attached = coordinator.attach(participantId, message => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > MAX_MESSAGE_BYTES * 4) { ws.terminate(); return; }
        ws.send(JSON.stringify(message));
      }, Date.now());
      if (!attached) { ws.close(1008); return; }
      authenticated.set(ws, participantId);
      ws.on('error', () => {});
      ws.on('pong', () => { missed = 0; });
      ws.on('message', (data, binary) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (binary) { ws.close(1003); return; }
        let message;
        try { message = parseClientMessage(JSON.parse(data.toString())); } catch { /* Never log raw signaling. */ }
        if (!message) { ws.close(1008); return; }
        const now = Date.now();
        const buckets = traffic.get(participantId) ?? new Map<string, number[]>(); traffic.set(participantId, buckets);
        for (const [key, times] of buckets) {
          while (times.length && times[0] <= now - 10_000) times.shift();
          if (!times.length) buckets.delete(key);
        }
        // Unknown pair IDs consume control budget; they cannot allocate unbounded buckets.
        const key = 'pairId' in message && coordinator.isPairMember(participantId, message.pairId) ? message.pairId : 'control';
        const times = buckets.get(key) ?? [];
        const total = [...buckets.values()].reduce((sum, values) => sum + values.length, 0);
        if (times.length >= 100 || total >= 500) { ws.close(1008); return; }
        times.push(now); buckets.set(key, times);
        coordinator.receive(participantId, message, now);
      });
      const heartbeat = setInterval(() => { if (missed >= 2) ws.terminate(); else { missed++; ws.ping(); } }, 20_000);
      ws.once('close', () => { clearInterval(heartbeat); authenticated.delete(ws); coordinator.detach(participantId, Date.now()); });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Host did not bind loopback');
  const clock = setInterval(() => coordinator.tick(Date.now()), 250);
  server.on('error', () => coordinator.end('failed'));
  let closing: Promise<void> | null = null;
  return { port: address.port, coordinator,
    updatePairing(next: HostPairing): void {
      if (!validateHost(next) || next.groupId !== current.groupId || next.hostId !== current.hostId || next.endpoint !== current.endpoint) throw new Error('Invalid group update');
      current = structuredClone(next); coordinator.updateMembers(current.members, Date.now());
      for (const [socket, memberId] of authenticated) if (!current.members.some(m => m.id === memberId)) socket.close(1008);
      for (const memberId of traffic.keys()) if (!current.members.some(m => m.id === memberId)) traffic.delete(memberId);
    },
    close: () => closing ??= (async () => {
      clearInterval(clock); coordinator.end('peer-left');
      for (const client of sockets.clients) client.terminate();
      sockets.close(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    })() };
}
