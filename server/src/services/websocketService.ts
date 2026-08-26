import WebSocket, { WebSocketServer } from 'ws';
import { WsMessage } from '../types';
import jwt from 'jsonwebtoken';

// ─── Module State ─────────────────────────────────────────────────────────────

let wssInstance: WebSocketServer | null = null;
const socketUsers = new Map<WebSocket, string>();
const sessionUsers = new Map<string, string>();

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupWebSocket(wss: WebSocketServer): void {
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket, request) => {
    const token = new URL(request.url ?? '/', 'http://localhost').searchParams.get('token');
    try {
      if (!token) throw new Error('Missing token');
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string };
      if (!payload.userId) throw new Error('Invalid token payload');
      socketUsers.set(ws, payload.userId);
    } catch {
      ws.close(1008, 'Invalid or missing token');
      return;
    }
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'connected', message: 'NEXUS Agent Online' } satisfies WsMessage));
    ws.on('close', () => { socketUsers.delete(ws); console.log('[WS] Client disconnected'); });
    ws.on('error', (err) => console.error('[WS] Error:', err));
  });
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

export function registerSessionOwner(sessionId: string, userId: string): void {
  sessionUsers.set(sessionId, userId);
}

export function broadcast(data: WsMessage, userId?: string): void {
  if (!wssInstance) return;
  const targetUserId = userId ?? (data.sessionId ? sessionUsers.get(data.sessionId) : undefined);
  const payload = JSON.stringify(data);
  wssInstance.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && (!targetUserId || socketUsers.get(client) === targetUserId)) client.send(payload);
  });
}
