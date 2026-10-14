import { Coordinator } from './coordinator.ts';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, parseClientMessage, validToken, type Role } from './protocol.ts';

export async function startSignaling(tokens: { hostToken: string; guestToken: string }, port = 47831): Promise<{ port: number; coordinator: Coordinator; close(): Promise<void> }> {
  if (!validToken(tokens.hostToken) || !validToken(tokens.guestToken) || tokens.hostToken === tokens.guestToken) throw new Error('Invalid host credentials');
  const coordinator = new Coordinator();
  const trafficByRole: Record<Role, number[]> = { host: [], guest: [] };
  const server = createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, (_request, response) => { response.writeHead(404); response.end(); });
  server.maxConnections = 16;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number) => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (request.url !== '/zoomtime') { reject(404); return; }
    if (request.headers.origin) { reject(403); return; }
    const credential = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!validToken(credential)) { reject(401); return; }
    const bytes = Buffer.from(credential, 'base64url');
    const hostMatch = timingSafeEqual(bytes, Buffer.from(tokens.hostToken, 'base64url'));
    const guestMatch = timingSafeEqual(bytes, Buffer.from(tokens.guestToken, 'base64url'));
    const role: Role | null = hostMatch ? 'host' : guestMatch ? 'guest' : null;
    if (!role) { reject(401); return; }
    if (coordinator.isOnline(role)) { reject(409); return; }
    sockets.handleUpgrade(request, socket, head, ws => {
      let missed = 0;
      const traffic = trafficByRole[role];
      const attached = coordinator.attach(role, message => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > MAX_MESSAGE_BYTES * 4) { ws.terminate(); return; }
        ws.send(JSON.stringify(message));
      }, Date.now());
      if (!attached) { ws.close(1008); return; }
      ws.on('error', () => {});
      ws.on('pong', () => { missed = 0; });
      ws.on('message', (data, binary) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (binary) { ws.close(1003); return; }
        const now = Date.now(); while (traffic.length && traffic[0] <= now - 10_000) traffic.shift();
        if (traffic.length >= 100) { ws.close(1008); return; } traffic.push(now);
        let message;
        try { message = parseClientMessage(JSON.parse(data.toString())); } catch { /* Invalid JSON is an unauthorized application message. */ }
        if (!message) { ws.close(1008); return; }
        coordinator.receive(role, message, now);
      });
      const heartbeat = setInterval(() => { if (missed >= 2) ws.terminate(); else { missed++; ws.ping(); } }, 20_000);
      ws.once('close', () => { clearInterval(heartbeat); coordinator.detach(role, Date.now()); });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Host did not bind loopback');
  const clock = setInterval(() => coordinator.tick(Date.now()), 250);
  server.on('error', () => coordinator.end('failed'));
  let closing: Promise<void> | null = null;
  return { port: address.port, coordinator, close: () => closing ??= (async () => {
    clearInterval(clock); coordinator.end('peer-left');
    for (const client of sockets.clients) client.terminate();
    sockets.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  })() };
}
