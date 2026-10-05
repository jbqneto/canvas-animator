import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { BridgeCommand } from '../src/automation/protocol';

const sessionSchema = z.object({ url: z.string().url(), token: z.string().regex(/^[a-f0-9]{64}$/) });

export function createBridgeClient(sessionFile: string) {
  return async (path: 'windows' | 'call', body?: unknown): Promise<any> => {
    let session: z.infer<typeof sessionSchema>;
    try { session = sessionSchema.parse(JSON.parse(await readFile(sessionFile, 'utf8'))); }
    catch { throw new Error('LOCAL_APP_NOT_RUNNING: execute npm run local and open /?mcp=1'); }
    const url = new URL(session.url);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('INVALID_LOCAL_SESSION');
    }
    let response: Response;
    try {
      response = await fetch(new URL(`/api/automation/${path}`, url), {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(35_000),
      });
    } catch { throw new Error('LOCAL_APP_UNREACHABLE_OR_TIMEOUT: check npm run local; do not blindly retry edits'); }
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('BRIDGE_NOT_ENABLED: use npm run local');
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'BRIDGE_REQUEST_FAILED');
    return path === 'windows' ? data : data.result;
  };
}

export function createFlashmotionMcp(request: ReturnType<typeof createBridgeClient>) {
  const server = new McpServer({ name: 'flashmotion', version: '1.0.0' });
  const windowId = z.string().uuid().describe('Window ID from list_windows. Always select the intended editor explicitly.');
  const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const safe = (handler: (...args: any[]) => Promise<any>) => async (args: any) => {
    try { return await handler(args); }
    catch (error) { return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'COMMAND_FAILED' }] }; }
  };
  const call = (id: string, command: BridgeCommand) => request('call', { windowId: id, command });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const edit = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool('list_windows', {
    description: 'List opted-in FlashMotion editor windows and their state. Open http://localhost:3000/?mcp=1 to connect. Status is refreshed every two seconds.',
    inputSchema: {}, annotations: readOnly,
  }, safe(async () => text(await request('windows'))));
  server.registerTool('get_status', {
    description: 'Read the current state of a selected editor. ready=false means the user must resolve autosave recovery before edits.',
    inputSchema: { windowId }, annotations: readOnly,
  }, safe(async ({ windowId }) => text(await call(windowId, { method: 'get_status' }))));
  server.registerTool('get_project', {
    description: 'Read the .fmproj JSON as file and its content revision. Use file.project.content and revision in replace_content. Settings and media references are included; AI keys are excluded.',
    inputSchema: { windowId }, annotations: readOnly,
  }, safe(async ({ windowId }) => text(await call(windowId, { method: 'get_project' }))));
  server.registerTool('replace_content', {
    description: 'Replace the full scene content as one undoable edit, preserving project settings. Read get_project first, preserve all desired objects, and supply its revision. REVISION_CONFLICT requires a fresh read and merge. Save via editor Ctrl+S. Timeout/disconnect means the outcome is unknown; inspect the scene before retrying.',
    inputSchema: { windowId, content: z.record(z.unknown()), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }, annotations: edit,
  }, safe(async ({ windowId, content, expectedRevision }) => text(await call(windowId, { method: 'replace_content', content, expectedRevision }))));
  server.registerTool('seek', {
    description: 'Pause and move the editor to a 1-based integer frame within the project duration.',
    inputSchema: { windowId, frame: z.number().int().min(1) }, annotations: edit,
  }, safe(async ({ windowId, frame }) => text(await call(windowId, { method: 'seek', frame }))));
  server.registerTool('set_playing', {
    description: 'Start or pause the selected editor playback. Pause before rendering frames.',
    inputSchema: { windowId, playing: z.boolean() }, annotations: edit,
  }, safe(async ({ windowId, playing }) => text(await call(windowId, { method: 'set_playing', playing }))));
  server.registerTool('render_frame', {
    description: 'Return a clean PNG of a frame as an MCP image. Playback must be paused. Uses the editor renderer, including seeking/restoring a reference video.',
    inputSchema: { windowId, frame: z.number().int().min(1) }, annotations: readOnly,
  }, safe(async ({ windowId, frame }) => {
    const url = await call(windowId, { method: 'render_frame', frame });
    if (typeof url !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)) throw new Error('INVALID_RENDER_RESULT');
    return { content: [{ type: 'image' as const, data: url.slice('data:image/png;base64,'.length), mimeType: 'image/png' }] };
  }));
  return server;
}

// Only the entry point starts stdio; the exported factory can be tested without opening stdin.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flag = process.argv.indexOf('--session-file');
  const sessionFile = flag >= 0 ? process.argv[flag + 1] : fileURLToPath(new URL('../.local/mcp-session.json', import.meta.url));
  if (!sessionFile) throw new Error('SESSION_FILE_REQUIRED');
  const server = createFlashmotionMcp(createBridgeClient(sessionFile));
  await server.connect(new StdioServerTransport());
}
