import { useEffect, useState } from 'react';
import { endMcpSession, initialMcpSession, MCP_SESSION_KEY, readMcpSession, startMcpSession } from './session';

export function useMcpSession() {
  const [session, setSession] = useState(initialMcpSession);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === MCP_SESSION_KEY || event.key === null) setSession(readMcpSession());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    const timer = setTimeout(() => { endMcpSession(); setSession(null); }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [session]);
  return {
    session,
    connect: () => setSession(startMcpSession()),
    disconnect: () => { endMcpSession(); setSession(null); },
  };
}
