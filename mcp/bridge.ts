import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Express } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { callSchema, statusSchema, MAX_BRIDGE_BYTES, type BridgeCommand } from '../src/automation/protocol';
import type { AutomationStatus } from '../src/automation/browserApi';
import { MCP_SESSION_TTL } from '../src/automation/session';
import { z } from 'zod';

type WindowSession = { socket: WebSocket; status: AutomationStatus; busy: boolean; sessionId: string; expiresAt: number };
type Pending = { windowId: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export function installAutomationBridge(app: Express, server: Server, options: { port: number; timeoutMs?: number }) {
  const token = randomBytes(32).toString('hex');
  const windows = new Map<string, WindowSession>();
  const pending = new Map<string, Pending>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BRIDGE_BYTES });
  const hosts = new Set([`localhost:${options.port}`, `127.0.0.1:${options.port}`]);
  const authenticate = (value: unknown) => {
    if (typeof value !== 'string') return false;
    const provided = Buffer.from(value);
    const expected = Buffer.from(token);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  };
  const allowed = (req: IncomingMessage, requireOrigin = false) => {
    const address = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '') || !hosts.has(req.headers.host || '')) return false;
    const origin = req.headers.origin;
    return origin ? origin === `http://${req.headers.host}` : !requireOrigin;
  };
  const finish = (id: string, error?: Error, value?: unknown) => {
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(id);
    const session = windows.get(request.windowId);
    if (session) session.busy = false;
    if (error) request.reject(error); else request.resolve(value);
  };
  const call = (windowId: string, command: BridgeCommand): Promise<unknown> => {
    const session = windows.get(windowId);
    if (!session || session.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('WINDOW_NOT_CONNECTED'));
    if (session.expiresAt <= Date.now()) return Promise.reject(new Error('SESSION_EXPIRED'));
    if (session.busy) return Promise.reject(new Error('WINDOW_BUSY'));
    session.busy = true;
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        finish(id, new Error('COMMAND_TIMEOUT_RESULT_UNKNOWN'));
        // Do not allow more commands into a window that may still be executing the timed-out call.
        session.socket.close(1011, 'COMMAND_TIMEOUT');
      }, options.timeoutMs ?? 30_000);
      pending.set(id, { windowId, resolve, reject, timer });
      session.socket.send(JSON.stringify({ type: 'command', id, command }), (error) => {
        if (error) finish(id, new Error('WINDOW_DISCONNECTED'));
      });
    });
  };

  app.use('/api/automation', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!allowed(req)) { res.status(403).json({ error: 'LOCAL_ORIGIN_REQUIRED' }); return; }
    if (req.path === '/session' && req.method === 'GET') {
      // Only same-origin browser JavaScript can bootstrap the WebSocket credential.
      if (req.headers['sec-fetch-site'] !== 'same-origin') { res.status(403).json({ error: 'SAME_ORIGIN_REQUIRED' }); return; }
      res.json({ token }); return;
    }
    if (!authenticate(req.headers.authorization?.replace(/^Bearer /, ''))) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
    next();
  });
  app.get('/api/automation/windows', (_req, res) => {
    res.json({ windows: [...windows].map(([windowId, session]) => ({ windowId, sessionId: session.sessionId, expiresAt: session.expiresAt, ...session.status })) });
  });
  app.post('/api/automation/call', async (req, res) => {
    const parsed = callSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_COMMAND' }); return; }
    try { res.json({ result: await call(parsed.data.windowId, parsed.data.command) }); }
    catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'COMMAND_FAILED' }); }
  });
  app.use('/api/automation', (_req, res) => { res.status(404).json({ error: 'NOT_FOUND' }); });

  const upgrade = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    if (req.url !== '/api/automation/ws') return;
    if (!allowed(req, true) || wss.clients.size >= 16) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  };
  server.on('upgrade', upgrade);
  wss.on('connection', (socket) => {
    let windowId: string | undefined;
    let alive = true;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const authTimer = setTimeout(() => socket.close(1008, 'AUTH_TIMEOUT'), 5000);
    const heartbeat = setInterval(() => {
      if (!alive) { socket.terminate(); return; }
      alive = false; socket.ping();
    }, 15_000);
    socket.on('pong', () => { alive = true; });
    socket.on('error', () => {}); // Close handles pending calls; never crash the host on a bad socket.
    socket.on('message', (raw, binary) => {
      try {
        if (binary) throw new Error('INVALID_MESSAGE');
        const message = JSON.parse(raw.toString());
        if (!windowId) {
          const status = statusSchema.safeParse(message.status);
          if (message.type !== 'hello' || !authenticate(message.token) || !status.success) throw new Error('UNAUTHORIZED');
          const sessionId = message.sessionId === undefined ? randomUUID() : z.string().uuid().parse(message.sessionId);
          const requestedId = message.windowId === undefined ? randomUUID() : z.string().uuid().parse(message.windowId);
          const expiresAt = message.expiresAt === undefined ? Date.now() + MCP_SESSION_TTL : message.expiresAt;
          if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + MCP_SESSION_TTL) throw new Error('INVALID_SESSION_EXPIRY');
          clearTimeout(authTimer);
          windowId = windows.has(requestedId) ? randomUUID() : requestedId;
          windows.set(windowId, { socket, status: status.data, busy: false, sessionId, expiresAt });
          expiryTimer = setTimeout(() => socket.close(1008, 'SESSION_EXPIRED'), expiresAt - Date.now());
          socket.send(JSON.stringify({ type: 'connected', windowId, sessionId, expiresAt }));
        } else if (message.type === 'status') {
          const status = statusSchema.parse(message.status);
          windows.get(windowId)!.status = status;
        } else if (message.type === 'result' && typeof message.id === 'string') {
          const request = pending.get(message.id);
          if (!request || request.windowId !== windowId) return;
          if (typeof message.error === 'string') finish(message.id, new Error(message.error.slice(0, 1000)));
          else finish(message.id, undefined, message.result);
        } else throw new Error('INVALID_MESSAGE');
      } catch { socket.close(1008, 'INVALID_MESSAGE'); }
    });
    socket.on('close', () => {
      clearTimeout(authTimer); clearTimeout(expiryTimer); clearInterval(heartbeat);
      if (!windowId) return;
      windows.delete(windowId);
      for (const [id, request] of pending) if (request.windowId === windowId) finish(id, new Error('WINDOW_DISCONNECTED_RESULT_UNKNOWN'));
    });
  });
  return {
    token,
    close: async () => {
      server.off('upgrade', upgrade);
      for (const [id] of pending) finish(id, new Error('BRIDGE_CLOSED'));
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
