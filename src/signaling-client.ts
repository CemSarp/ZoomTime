import WebSocket from 'ws';
import { MAX_MESSAGE_BYTES, parseClientMessage, parseServerMessage, type ClientMessage, type ServerMessage } from './protocol.ts';
import type { NetworkStatus } from './calling-state.ts';
export type { NetworkStatus } from './calling-state.ts';
export class SignalingClient {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private fatal = false;
  private endpoint: string;
  private token: string;
  private message: (message: ServerMessage) => void;
  private status: (status: NetworkStatus) => void;
  constructor(endpoint: string, token: string, message: (message: ServerMessage) => void, status: (status: NetworkStatus) => void) {
    this.endpoint = endpoint; this.token = token; this.message = message; this.status = status;
  }
  start(): void { if (!this.stopped) return; this.stopped = false; this.fatal = false; this.connect(); }
  private connect(): void {
    if (this.stopped || this.fatal) return;
    this.status({ state: 'connecting', message: 'Connecting to your private host…' });
    const socket = new WebSocket(this.endpoint, { headers: { Authorization: `Bearer ${this.token}`, 'X-ZoomTime-Protocol': '2' }, perMessageDeflate: false, maxPayload: MAX_MESSAGE_BYTES, handshakeTimeout: 8000 });
    this.socket = socket; let missed = 0;
    const fail = (message: string) => { this.fatal = true; this.status({ state: 'error', message }); socket.terminate(); };
    socket.on('open', () => {
      if (this.stopped) { socket.terminate(); return; }
      this.send({ v: 2, type: 'sync' });
      this.heartbeat = setInterval(() => { if (missed >= 2) socket.terminate(); else { missed++; socket.ping(); } }, 20_000);
    });
    socket.on('pong', () => { missed = 0; });
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      if ((response.statusCode ?? 0) >= 500) { socket.terminate(); return; }
      fail(response.statusCode === 426 ? 'Update every group member to the group-calling version of ZoomTime.' : response.statusCode === 409 ? 'This participant is already connected. Close the other instance and retry.' :
        response.statusCode === 401 || response.statusCode === 403 ? 'Pairing was rejected. Check the invitation or reset and pair again.' :
          'The private endpoint did not accept WebSockets. Check its Tailscale Serve configuration and invitation endpoint.');
    });
    socket.on('message', (data, binary) => {
      let parsed;
      try { if (!binary) parsed = parseServerMessage(JSON.parse(data.toString())); } catch { /* Reject malformed server data without logging it. */ }
      if (!parsed) { fail('The host sent an incompatible message. Update every group member to the current ZoomTime version.'); return; }
      if (parsed.type === 'state') this.status({ state: 'online', message: 'Private signaling connected' });
      this.message(parsed);
    });
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code && /CERT|TLS|SSL|UNABLE_TO_VERIFY/.test(error.code)) fail('The private host certificate could not be verified. Check its Tailscale HTTPS setup and your clock.');
    });
    socket.on('close', code => {
      if (this.socket !== socket) return;
      clearInterval(this.heartbeat); this.socket = null;
      if (this.stopped || this.fatal) return;
      if (code === 1008) { this.fatal = true; this.status({ state: 'error', message: 'Pairing or signaling limits were rejected. Check group access and retry.' }); return; }
      this.status({ state: 'offline', message: 'Host unavailable. Check that the host app and Tailscale are connected.' });
      this.retry = setTimeout(() => this.connect(), 1000);
    });
  }
  send(message: ClientMessage): boolean {
    if (!parseClientMessage(message) || this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > MAX_MESSAGE_BYTES * 4) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  stop(): void {
    this.stopped = true; clearTimeout(this.retry); clearInterval(this.heartbeat);
    this.socket?.terminate(); this.socket = null;
  }
}
