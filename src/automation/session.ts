export const MCP_SESSION_KEY = 'flashmotion.mcpSession';
export const MCP_WINDOW_KEY = 'flashmotion.mcpWindow';
export const MCP_SESSION_TTL = 8 * 60 * 60 * 1000;
export interface McpSession { version: 1; enabled: true; sessionId: string; expiresAt: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readMcpSession(now = Date.now()): McpSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(MCP_SESSION_KEY) || 'null');
    return value?.version === 1 && value.enabled === true && uuid.test(value.sessionId) &&
      Number.isSafeInteger(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + MCP_SESSION_TTL
      ? value : null;
  } catch { return null; }
}

export function startMcpSession(now = Date.now()): McpSession {
  const session: McpSession = { version: 1, enabled: true, sessionId: crypto.randomUUID(), expiresAt: now + MCP_SESSION_TTL };
  try { localStorage.setItem(MCP_SESSION_KEY, JSON.stringify(session)); } catch { /* Works until this page closes if storage is blocked. */ }
  return session;
}

export function endMcpSession() {
  // Keep a tombstone so an old ?mcp=1 URL cannot silently reactivate a disconnected/expired session.
  try { localStorage.setItem(MCP_SESSION_KEY, JSON.stringify({ version: 1, enabled: false })); } catch { /* No persistent grant exists. */ }
}

export function initialMcpSession(): McpSession | null {
  const session = readMcpSession();
  if (session) return session;
  let knownSession = false;
  try { knownSession = localStorage.getItem(MCP_SESSION_KEY) !== null; } catch { /* Storage unavailable. */ }
  if (!knownSession && new URLSearchParams(window.location.search).get('mcp') === '1') return startMcpSession();
  return null;
}

export function readMcpWindowId(): string {
  try {
    const saved = sessionStorage.getItem(MCP_WINDOW_KEY);
    if (saved && uuid.test(saved)) return saved;
  } catch { /* Generate a window identity for this connection. */ }
  const id = crypto.randomUUID();
  saveMcpWindowId(id);
  return id;
}

export function saveMcpWindowId(id: string) {
  if (!uuid.test(id)) return;
  try { sessionStorage.setItem(MCP_WINDOW_KEY, id); } catch { /* Reconnect gets a new identity if tab storage is blocked. */ }
}
