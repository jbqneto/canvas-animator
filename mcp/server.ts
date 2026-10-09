import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { evenFrames } from '../src/engine/contactSheet';
import { describeScene } from '../src/engine/describe';
import { lintScene } from '../src/engine/lint';
import { cameraSchema, type BridgeCommand } from '../src/automation/protocol';

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
  server.registerTool('load_project', {
    description: 'Open a .fmproj file from an absolute path into the selected editor, replacing the whole project (name, FPS, canvas, duration and content). Unsaved edits in that window are discarded (save first with Ctrl+S if needed).',
    inputSchema: { windowId, path: z.string().min(1).describe('Absolute path of the .fmproj file on this computer') }, annotations: edit,
  }, safe(async ({ windowId, path }) => {
    if (!isAbsolute(path)) throw new Error('ABSOLUTE_PATH_REQUIRED');
    const file = await readFile(path, 'utf8');
    return text(await call(windowId, { method: 'load_project', file }));
  }));
  server.registerTool('export_video', {
    description: 'Render the selected editor timeline (or an inclusive frame range) to MP4 (or transparent WebM with format=webm-alpha) and write it to an absolute path on this computer. Waits until the export finishes (it may take a while for long timelines).',
    inputSchema: { windowId, outputPath: z.string().min(1), format: z.enum(['mp4', 'webm-alpha']).optional(),
      startFrame: z.number().int().min(1).optional(), endFrame: z.number().int().min(1).optional() }, annotations: edit,
  }, safe(async ({ windowId, outputPath, format, startFrame, endFrame }) => {
    if (!isAbsolute(outputPath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
    await call(windowId, { method: 'export_start', format, startFrame, endFrame });
    let status: any;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      status = await call(windowId, { method: 'export_status' });
      if (status?.state === 'error') throw new Error(`EXPORT_FAILED: ${status.error}`);
      if (status?.state === 'done') break;
    }
    const parts: Buffer[] = [];
    for (let offset = 0; offset < status.size; offset += 8 * 1024 * 1024) {
      const chunk = await call(windowId, { method: 'export_chunk', offset, length: 8 * 1024 * 1024 });
      parts.push(Buffer.from(chunk.data, 'base64'));
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.concat(parts));
    return text({ outputPath, bytes: status.size, extension: status.extension });
  }));
  server.registerTool('set_camera', {
    description: 'Set the virtual camera that moves/zooms/rotates all scene objects (not the background) over time. REPLACES the whole camera; pass camera=null to remove it. base = static pan/zoom/rotation (panX/panY are pixel offsets from the canvas center, zoom 0.05..20, rotation in degrees); tracks = keyframes per property, e.g. a slow push-in: {"tracks":{"zoom":[{"frame":1,"value":1,"easing":"linear"},{"frame":240,"value":1.08}]}}. One undoable edit.',
    inputSchema: { windowId, camera: cameraSchema.nullable() }, annotations: edit,
  }, safe(async ({ windowId, camera }) => text(await call(windowId, { method: 'set_camera', camera }))));
  server.registerTool('render_contact_sheet', {
    description: 'Render several frames into ONE PNG grid (each cell labeled #frame) to review a whole animation in a single call. Pass frames explicitly, or count (default 6) evenly spaced between startFrame (default 1) and endFrame (default: last frame). Max 24 frames; columns 1-6 (default 3); cellWidth 160-960 (default 480). Playback must be paused.',
    inputSchema: {
      windowId,
      frames: z.array(z.number().int().min(1)).min(1).max(24).optional(),
      count: z.number().int().min(1).max(24).optional(),
      startFrame: z.number().int().min(1).optional(),
      endFrame: z.number().int().min(1).optional(),
      columns: z.number().int().min(1).max(6).optional(),
      cellWidth: z.number().int().min(160).max(960).optional(),
    },
    annotations: readOnly,
  }, safe(async ({ windowId, frames, count, startFrame, endFrame, columns, cellWidth }) => {
    const list = frames ?? evenFrames(startFrame ?? 1, endFrame ?? (await call(windowId, { method: 'get_status' })).totalFrames, count ?? 6);
    const url = await call(windowId, { method: 'render_contact_sheet', frames: list, columns, cellWidth });
    if (typeof url !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)) throw new Error('INVALID_RENDER_RESULT');
    return { content: [{ type: 'image' as const, data: url.slice('data:image/png;base64,'.length), mimeType: 'image/png' }] };
  }));
  server.registerTool('lint_scene', {
    description: 'Check the open scene for common problems before exporting: text too small to read on a phone (min 34 px at 1080p), text outside the 5% safe area, low text/background contrast, empty texts, objects past the end of the timeline. Returns { issues: [{ rule, severity, objectId, message }] } (empty = clean).',
    inputSchema: { windowId }, annotations: readOnly,
  }, safe(async ({ windowId }) => {
    const { file } = await call(windowId, { method: 'get_project' });
    return text({ issues: lintScene(file.project) });
  }));
  server.registerTool('describe_scene', {
    description: 'Compact timeline summary (what appears when, in seconds, plus markers, duration and whether a camera exists). Much cheaper than get_project for orienting yourself.',
    inputSchema: { windowId }, annotations: readOnly,
  }, safe(async ({ windowId }) => {
    const { file } = await call(windowId, { method: 'get_project' });
    return text(describeScene(file.project));
  }));
  server.registerTool('list_templates', {
    description: 'List the built-in animation templates (id, parameters with defaults/ranges/options). Use apply_template to insert one.',
    inputSchema: { windowId }, annotations: readOnly,
  }, safe(async ({ windowId }) => text(await call(windowId, { method: 'list_templates' }))));
  server.registerTool('apply_template', {
    description: 'Insert a template (see list_templates) as ordinary editable objects with layers, as one undoable edit. values override the defaults (numbers are clamped to the parameter range; colors are #rrggbb). startFrame defaults to the current frame. The result says fitsTimeline=false when the template ends after the project duration: shorten it or extend the timeline in the editor.',
    inputSchema: { windowId, templateId: z.string().min(1), values: z.record(z.union([z.string(), z.number()])).optional(), startFrame: z.number().int().min(1).optional() },
    annotations: edit,
  }, safe(async ({ windowId, templateId, values, startFrame }) =>
    text(await call(windowId, { method: 'apply_template', templateId, values, startFrame }))));
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
