import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { installAutomationBridge } from '../bridge';
import { createBridgeClient, createFlashmotionMcp } from '../server';
import { createBrowserApi, type AutomationStatus } from '../../src/automation/browserApi';
import { executeBridgeCommand } from '../../src/automation/mcpBridge';
import { parseProject, serializeProject } from '../../src/project/projectFile';
import { callSchema } from '../../src/automation/protocol';

/** Every tool the server registers. Add new names here when a task registers a tool. */
const EXPECTED_TOOLS = [
  'list_windows', 'get_status', 'get_project', 'replace_content', 'seek', 'set_playing', 'render_frame',
  'load_project', 'export_video', 'set_camera', 'list_templates', 'apply_template',
  'render_contact_sheet',
];

describe('MCP and local browser bridge', () => {
  let http: Server;
  let bridge: ReturnType<typeof installAutomationBridge>;
  let folder: string;
  let sessionFile: string;
  let url: string;
  let client: Client;
  let mcp: ReturnType<typeof createFlashmotionMcp>;
  let sockets: WebSocket[];

  beforeEach(async () => {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    http = createServer(app);
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const port = (http.address() as import('node:net').AddressInfo).port;
    url = `http://127.0.0.1:${port}`;
    bridge = installAutomationBridge(app, http, { port, timeoutMs: 150 });
    folder = await mkdtemp(path.join(tmpdir(), 'flashmotion-test-'));
    sessionFile = path.join(folder, 'session.json');
    await writeFile(sessionFile, JSON.stringify({ url, token: bridge.token }), { mode: 0o600 });
    mcp = createFlashmotionMcp(createBridgeClient(sessionFile));
    client = new Client({ name: 'integration-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcp.connect(serverTransport);
    await client.connect(clientTransport);
    sockets = [];
  });
  afterEach(async () => {
    await client.close();
    await mcp.close();
    await bridge.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(folder, { recursive: true, force: true });
  });

  async function windowSession(respond = true, identity: { windowId?: string; sessionId?: string; expiresAt?: number } = {}) {
    const status: AutomationStatus = { name: 'Scene', frame: 1, fps: 24, totalFrames: 60,
      playing: false, dirty: false, ready: true, exporting: false };
    let content = { frames: {}, charts: [], texts: [], images: [], actors: [], paths: [], layers: [], markers: [] };
    const api = createBrowserApi({
      status: () => status,
      project: () => serializeProject({ name: 'Scene', fps: 24, totalFrames: 60, canvas: { width: 1280, height: 720, preset: 'custom' },
        videoBg: { type: 'color', color: '#000', opacity: 1, playbackRate: 1 }, content }),
      replaceContent: (next) => { content = next as typeof content; status.dirty = true; },
      seek: (frame) => { status.frame = frame; status.playing = false; },
      play: (playing) => { status.playing = playing; },
      loadProject: () => {},
      contactSheet: async () => 'data:image/png;base64,iVBORw0KGgo=',
      exportVideo: async () => ({ blob: new Blob([new Uint8Array([1, 2, 3])]), extension: 'mp4' }),
      render: async () => 'data:image/png;base64,iVBORw0KGgo=',
    });
    const socket = new WebSocket(url.replace('http:', 'ws:') + '/api/automation/ws', { origin: url });
    sockets.push(socket);
    const connected = new Promise<string>((resolve, reject) => {
      socket.on('error', reject);
      socket.on('message', async (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'connected') resolve(message.windowId);
        if (message.type !== 'command' || !respond) return;
        try {
          const result = await executeBridgeCommand(api, message.command);
          socket.send(JSON.stringify({ type: 'result', id: message.id, result }));
        } catch (error) {
          socket.send(JSON.stringify({ type: 'result', id: message.id, error: error instanceof Error ? error.message : 'FAILED' }));
        }
      });
    });
    await once(socket, 'open');
    socket.send(JSON.stringify({ ...identity, type: 'hello', token: bridge.token, status }));
    return { windowId: await connected, socket, status, api };
  }
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  const value = (result: any) => JSON.parse(result.content[0].text);

  it('negotiates MCP tools and reports an editor only after opting in', async () => {
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect([...names].sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(value(await call('list_windows'))).toEqual({ windows: [] });
    const { windowId } = await windowSession();
    expect(value(await call('list_windows')).windows[0]).toMatchObject({ windowId, name: 'Scene', ready: true });
  });

  it('edits the real protocol scene, rejects stale revisions, controls playback and returns MCP images', async () => {
    const { windowId, api } = await windowSession();
    const read = value(await call('get_project', { windowId }));
    const content = read.file.project.content;
    content.markers.push({ id: 'm1', frame: 24, label: 'Entry', color: '#f59e0b' });
    const edited = await call('replace_content', { windowId, content, expectedRevision: read.revision });
    expect(edited.isError).not.toBe(true);
    expect(api.getProject().project.content.markers[0].label).toBe('Entry');
    expect(value(edited).dirty).toBe(true);
    expect((await call('replace_content', { windowId, content, expectedRevision: read.revision })).isError).toBe(true);
    expect((await call('replace_content', { windowId, content, expectedRevision: read.revision })).content).toMatchObject([{ text: 'REVISION_CONFLICT' }]);
    expect(value(await call('seek', { windowId, frame: 24 })).frame).toBe(24);
    expect(value(await call('set_playing', { windowId, playing: true })).playing).toBe(true);
    expect((await call('render_frame', { windowId, frame: 24 })).isError).toBe(true);
    await call('set_playing', { windowId, playing: false });
    expect((await call('render_frame', { windowId, frame: 24 })).content).toEqual([
      { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
    ]);
    expect(parseProject(JSON.stringify(api.getProject())).content.markers).toHaveLength(1);
  });

  it('rejects wrong credentials, foreign origins and rebinding hosts', async () => {
    expect((await fetch(`${url}/api/automation/windows`)).status).toBe(401);
    expect((await fetch(`${url}/api/automation/windows`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await fetch(`${url}/api/automation/windows`, { headers: { Authorization: `Bearer ${bridge.token}`, Origin: 'https://evil.example' } })).status).toBe(403);
    const reboundStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${url}/api/automation/windows`, { headers: { Host: 'evil.example', Authorization: `Bearer ${bridge.token}` } }, (res) => {
        res.resume(); resolve(res.statusCode!);
      });
      req.on('error', reject); req.end();
    });
    expect(reboundStatus).toBe(403);
    expect((await fetch(`${url}/api/automation/session`)).status).toBe(403);
    const valid = await fetch(`${url}/api/automation/session`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
    expect(valid.status).toBe(200);
    expect(valid.headers.get('cache-control')).toBe('no-store');
    const rejected = new WebSocket(url.replace('http:', 'ws:') + '/api/automation/ws', { origin: 'https://evil.example' });
    const error = once(rejected, 'error');
    await error;
    const unauthenticated = new WebSocket(url.replace('http:', 'ws:') + '/api/automation/ws', { origin: url });
    await once(unauthenticated, 'open');
    const closed = once(unauthenticated, 'close');
    unauthenticated.send(JSON.stringify({ type: 'hello', token: 'wrong', status: {} }));
    expect((await closed)[0]).toBe(1008);
  });

  it('rejects missing windows and cleans up timed-out and disconnected commands', async () => {
    const { windowId, socket } = await windowSession(false);
    const timeout = await call('seek', { windowId, frame: 2 });
    expect(timeout).toMatchObject({ isError: true, content: [{ text: 'COMMAND_TIMEOUT_RESULT_UNKNOWN' }] });
    if (socket.readyState !== WebSocket.CLOSED) await once(socket, 'close');
    expect(value(await call('list_windows')).windows).toHaveLength(0);
    expect(await call('get_status', { windowId })).toMatchObject({ isError: true, content: [{ text: 'WINDOW_NOT_CONNECTED' }] });
    const second = await windowSession(false);
    const request = createBridgeClient(sessionFile)('call', { windowId: second.windowId, command: { method: 'seek', frame: 3 } });
    await once(second.socket, 'message');
    second.socket.close();
    await expect(request).rejects.toThrow('WINDOW_DISCONNECTED_RESULT_UNKNOWN');
  });

  it('does not accept arbitrary RPC methods or run a second command in a busy window', async () => {
    expect(callSchema.safeParse({ windowId: crypto.randomUUID(), command: { method: 'eval', code: 'malicious' } }).success).toBe(false);
    const { windowId, socket } = await windowSession(false);
    const request = createBridgeClient(sessionFile)('call', { windowId, command: { method: 'seek', frame: 3 } });
    await once(socket, 'message');
    await expect(createBridgeClient(sessionFile)('call', { windowId, command: { method: 'seek', frame: 4 } })).rejects.toThrow('WINDOW_BUSY');
    await expect(request).rejects.toThrow('COMMAND_TIMEOUT_RESULT_UNKNOWN');
  });

  it('keeps the editor identity across reconnects and separates duplicate tabs', async () => {
    const identity = { windowId: crypto.randomUUID(), sessionId: crypto.randomUUID(), expiresAt: Date.now() + 60_000 };
    const first = await windowSession(true, identity);
    expect(first.windowId).toBe(identity.windowId);
    const duplicate = await windowSession(true, identity);
    expect(duplicate.windowId).not.toBe(identity.windowId);
    const closed = once(first.socket, 'close'); first.socket.close(); await closed;
    const resumed = await windowSession(true, identity);
    expect(resumed.windowId).toBe(identity.windowId);
    const windows = value(await call('list_windows')).windows;
    expect(windows.find((w: any) => w.windowId === resumed.windowId)).toMatchObject({ sessionId: identity.sessionId, expiresAt: identity.expiresAt });
  });

  it('expires the grant on the server without depending on browser timers', async () => {
    const { socket } = await windowSession(true, { expiresAt: Date.now() + 200 });
    const [code, reason] = await once(socket, 'close');
    expect(code).toBe(1008);
    expect(reason.toString()).toBe('SESSION_EXPIRED');
    expect(value(await call('list_windows')).windows).toHaveLength(0);
  });

  it('rejects remote session URLs and reports missing local app configuration', async () => {
    await writeFile(sessionFile, JSON.stringify({ url: 'https://evil.example', token: bridge.token }));
    await expect(createBridgeClient(sessionFile)('windows')).rejects.toThrow('INVALID_LOCAL_SESSION');
    await expect(createBridgeClient(path.join(folder, 'missing.json'))('windows')).rejects.toThrow('LOCAL_APP_NOT_RUNNING');
  });
});
