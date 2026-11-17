import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool.js';
import type { AuthUser, RoleName } from '../types.js';
import { hashToken } from '../auth/session.js';

interface WsSessionRow extends RowDataPacket {
  user_id: number;
  email: string;
  display_name: string;
  role: RoleName;
  astronaut_id: number | null;
  token_hash: string;
  csrf_hash: string;
}
interface ClientState { auth: AuthUser; subscriptions: Map<string, string>; buffer: string }

const clients = new Map<WebSocket, ClientState>();
let messageCounter = 0;

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function resolveAuth(request: IncomingMessage): Promise<AuthUser | null> {
  const raw = cookieValue(request.headers.cookie, 'astrocare_session');
  if (!raw) return null;
  const [rows] = await pool.execute<WsSessionRow[]>(
    `SELECT u.id AS user_id, u.email, u.display_name, r.name AS role, a.id AS astronaut_id,
            s.token_hash, s.csrf_hash
     FROM application_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN astronauts a ON a.user_id = u.id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.active = TRUE LIMIT 1`,
    [hashToken(decodeURIComponent(raw))],
  );
  if (!rows[0]) return null;
  return {
    userId: Number(rows[0].user_id), email: rows[0].email, displayName: rows[0].display_name,
    role: rows[0].role, astronautId: rows[0].astronaut_id === null ? null : Number(rows[0].astronaut_id),
    sessionTokenHash: rows[0].token_hash, csrfHash: rows[0].csrf_hash,
  };
}

function sendFrame(socket: WebSocket, command: string, headers: Record<string, string>, body = ''): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const headerText = Object.entries(headers).map(([key, value]) => `${key}:${value}`).join('\n');
  socket.send(`${command}\n${headerText}\n\n${body}\0`);
}

function parseFrame(raw: string): { command: string; headers: Record<string, string>; body: string } | null {
  const clean = raw.replace(/^\n+/, '');
  if (!clean.trim()) return null;
  const boundary = clean.indexOf('\n\n');
  const head = boundary >= 0 ? clean.slice(0, boundary) : clean;
  const body = boundary >= 0 ? clean.slice(boundary + 2) : '';
  const [command, ...headerLines] = head.split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon)] = line.slice(colon + 1);
  }
  return command ? { command: command.trim(), headers, body } : null;
}

function canSubscribe(auth: AuthUser, destination: string): boolean {
  const match = destination.match(/^\/topic\/(telemetry|alerts)\/(\d+)$/);
  const notifications = destination.match(/^\/topic\/notifications\/(\d+)$/);
  if (notifications) return Number(notifications[1]) === auth.userId;
  if (!match) return false;
  return auth.role === 'ROLE_FLIGHT_SURGEON' || auth.astronautId === Number(match[2]);
}

function handleFrame(socket: WebSocket, frame: { command: string; headers: Record<string, string>; body: string }): void {
  const state = clients.get(socket);
  if (!state) return;
  if (frame.command === 'CONNECT' || frame.command === 'STOMP') {
    sendFrame(socket, 'CONNECTED', { version: '1.2', 'heart-beat': '0,0', server: 'astrocare-node' });
    return;
  }
  if (frame.command === 'SUBSCRIBE') {
    const destination = frame.headers.destination ?? '';
    const id = frame.headers.id ?? `sub-${state.subscriptions.size + 1}`;
    if (!canSubscribe(state.auth, destination)) {
      sendFrame(socket, 'ERROR', { message: 'Topic unavailable for this role' }, 'The requested channel is not authorized.');
      socket.close(1008, 'Unauthorized topic');
      return;
    }
    state.subscriptions.set(id, destination);
    return;
  }
  if (frame.command === 'UNSUBSCRIBE') {
    state.subscriptions.delete(frame.headers.id ?? '');
    return;
  }
  if (frame.command === 'DISCONNECT') {
    sendFrame(socket, 'RECEIPT', { 'receipt-id': frame.headers.receipt ?? 'disconnect' });
    socket.close(1000, 'Disconnected');
  }
}

export function installRealtime(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const authorizedSockets = new WeakMap<WebSocket, AuthUser>();
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    void resolveAuth(request)
      .then((auth) => {
        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (websocket) => {
          authorizedSockets.set(websocket, auth);
          wss.emit('connection', websocket, request);
        });
      })
      .catch(() => {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        socket.destroy();
      });
  });

  wss.on('connection', (socket: WebSocket, _request: IncomingMessage) => {
    const auth = authorizedSockets.get(socket);
    if (!auth) {
      socket.close(1008, 'Authentication required');
      return;
    }
    const state: ClientState = { auth, subscriptions: new Map(), buffer: '' };
    clients.set(socket, state);
    socket.on('message', (data: RawData) => {
      state.buffer += data.toString();
      let boundary = state.buffer.indexOf('\0');
      while (boundary >= 0) {
        const raw = state.buffer.slice(0, boundary);
        state.buffer = state.buffer.slice(boundary + 1);
        const frame = parseFrame(raw);
        if (frame) handleFrame(socket, frame);
        boundary = state.buffer.indexOf('\0');
      }
      if (state.buffer.length > 64 * 1024) socket.close(1009, 'Frame too large');
    });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
}

export function broadcastTopic(destination: string, payload: unknown): void {
  const body = JSON.stringify(payload);
  for (const [socket, state] of clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    for (const [subscription, subscribedDestination] of state.subscriptions) {
      if (subscribedDestination !== destination) continue;
      messageCounter += 1;
      sendFrame(socket, 'MESSAGE', {
        destination,
        subscription,
        'message-id': `astrocare-${messageCounter}`,
        'content-type': 'application/json',
      }, body);
    }
  }
}
