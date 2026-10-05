// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endMcpSession, initialMcpSession, MCP_SESSION_KEY, MCP_SESSION_TTL, readMcpSession, readMcpWindowId, startMcpSession } from '../session';
import { useMcpSession } from '../useMcpSession';

let root: Root;
let result: ReturnType<typeof useMcpSession>;
function Harness() { result = useMcpSession(); return null; }
const mount = () => act(async () => root.render(<StrictMode><Harness /></StrictMode>));
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('temporary MCP sessions', () => {
  it('remembers the connection for eight hours without saving credentials', async () => {
    const session = startMcpSession();
    expect(session.expiresAt - Date.now()).toBe(MCP_SESSION_TTL);
    expect(Object.keys(JSON.parse(localStorage.getItem(MCP_SESSION_KEY)!)).sort()).toEqual(['enabled', 'expiresAt', 'sessionId', 'version']);
    expect(initialMcpSession()).toEqual(session);
    await mount();
    expect(result.session?.sessionId).toBe(session.sessionId);
    await act(async () => { await vi.advanceTimersByTimeAsync(MCP_SESSION_TTL); });
    expect(result.session).toBeNull();
    window.history.replaceState(null, '', '/?mcp=1');
    expect(initialMcpSession()).toBeNull();
  });
  it('disconnect revokes the stored grant and an old URL cannot reactivate it', () => {
    window.history.replaceState(null, '', '/?mcp=1');
    expect(initialMcpSession()).not.toBeNull();
    endMcpSession();
    expect(initialMcpSession()).toBeNull();
    expect(startMcpSession()).not.toBeNull();
  });
  it('rejects corrupted, expired and excessively long grants', () => {
    const session = startMcpSession();
    for (const value of ['broken', JSON.stringify({ ...session, expiresAt: Date.now() }), JSON.stringify({ ...session, expiresAt: Date.now() + MCP_SESSION_TTL + 1 })]) {
      localStorage.setItem(MCP_SESSION_KEY, value);
      expect(readMcpSession()).toBeNull();
    }
  });
  it('keeps distinct session and tab identities, reusing the tab ID after reconnect', () => {
    const session = startMcpSession();
    const tab = readMcpWindowId();
    expect(readMcpWindowId()).toBe(tab);
    expect(tab).not.toBe(session.sessionId);
    sessionStorage.clear();
    expect(readMcpWindowId()).not.toBe(tab);
  });
  it('synchronizes a disconnect from another tab', async () => {
    startMcpSession(); await mount();
    expect(result.session).not.toBeNull();
    await act(async () => { endMcpSession(); window.dispatchEvent(new StorageEvent('storage', { key: MCP_SESSION_KEY })); });
    expect(result.session).toBeNull();
  });
  it('still allows a temporary connection when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(startMcpSession().enabled).toBe(true);
    vi.restoreAllMocks();
  });
});
