import WebSocket, { WebSocketServer } from 'ws';
import { WsMessage } from '../types';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

// ─── Module State ─────────────────────────────────────────────────────────────

let wssInstance: WebSocketServer | null = null;
const socketUsers = new Map<WebSocket, string>();
const sessionUsers = new Map<string, string>();

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupWebSocket(wss: WebSocketServer): void {
  wssInstance = wss;

  wss.on('connection', async (ws: WebSocket, request) => {
    const token = new URL(request.url ?? '/', 'http://localhost').searchParams.get('token');
    let connectedUserId: string | null = null;

    if (token && token !== 'null' && token !== 'undefined') {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string };
        if (payload.userId) {
          connectedUserId = payload.userId;
        }
      } catch {
        // Token invalid, fall back to desktop/local user below
      }
    }

    // Fallback: If connecting from desktop overlay or local assistant without token
    if (!connectedUserId) {
      try {
        const defaultUser = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
        if (defaultUser) {
          connectedUserId = defaultUser.id;
        }
      } catch {
        // ignore
      }
    }

    if (connectedUserId) {
      socketUsers.set(ws, connectedUserId);
      console.log(`[WS] Client connected (User: ${connectedUserId})`);
    } else {
      console.log('[WS] Anonymous/Local client connected');
    }

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
    // Deliver to user matching targetUserId, or to any client if target is not restricted, or to untagged desktop sockets
    const socketUserId = socketUsers.get(client);
    const shouldSend = !targetUserId || !socketUserId || socketUserId === targetUserId;
    if (client.readyState === WebSocket.OPEN && shouldSend) {
      client.send(payload);
    }
  });
}
