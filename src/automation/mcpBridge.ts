import { flushSync } from 'react-dom';
import type { BrowserAutomationApi } from './browserApi';
import { readMcpWindowId, saveMcpWindowId, type McpSession } from './session';
import { commandSchema, MAX_BRIDGE_BYTES, type BridgeCommand } from './protocol';

export type McpConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

async function revision(content: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function executeBridgeCommand(api: BrowserAutomationApi, command: BridgeCommand) {
  switch (command.method) {
    case 'get_status': return api.getStatus();
    case 'get_project': {
      const file = api.getProject();
      return { file, revision: await revision(file.project.content) };
    }
    case 'replace_content': {
      const content = api.getProject().project.content;
      const before = JSON.stringify(content);
      if (await revision(content) !== command.expectedRevision || JSON.stringify(api.getProject().project.content) !== before) {
        throw new Error('REVISION_CONFLICT');
      }
      flushSync(() => api.replaceContent(command.content));
      return api.getStatus();
    }
    case 'seek': flushSync(() => api.seek(command.frame)); return api.getStatus();
    case 'set_playing': flushSync(() => api.setPlaying(command.playing)); return api.getStatus();
    case 'render_frame': return api.renderFrame(command.frame);
    case 'load_project': flushSync(() => api.loadProject(command.file)); return api.getStatus();
    case 'export_start': return api.startExport({ format: command.format, startFrame: command.startFrame, endFrame: command.endFrame });
    case 'export_status': return api.exportStatus();
    case 'export_chunk': return api.exportChunk(command.offset, command.length);
    case 'set_camera': flushSync(() => api.setCamera(command.camera)); return api.getStatus();
    case 'render_contact_sheet': return api.renderContactSheet(command.frames, { columns: command.columns, cellWidth: command.cellWidth });
    case 'list_templates': return api.listTemplates();
    case 'apply_template': {
      let result!: ReturnType<typeof api.applyTemplate>;
      flushSync(() => { result = api.applyTemplate(command.templateId, command.values, command.startFrame); });
      return { ...result, status: api.getStatus() };
    }
  }
}

/** Same-origin, opt-in bridge. Never evaluates code supplied by the MCP client. */
export function connectMcpBridge(api: BrowserAutomationApi, onState: (state: McpConnectionState) => void, session: McpSession) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const connect = async () => {
    if (stopped || Date.now() >= session.expiresAt) return;
    onState('connecting');
    try {
      const response = await fetch('/api/automation/session', { signal: abort.signal, cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        onState('unavailable'); return;
      }
      const { token } = await response.json();
      if (stopped) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/automation/ws`);
      const connection = socket;
      let busy = false;
      connection.onopen = () => connection.send(JSON.stringify({ type: 'hello', token, status: api.getStatus(), sessionId: session.sessionId, windowId: readMcpWindowId(), expiresAt: session.expiresAt }));
      connection.onmessage = async (event) => {
        try {
          if (typeof event.data !== 'string' || event.data.length > MAX_BRIDGE_BYTES) throw new Error('INVALID_MESSAGE');
          const message = JSON.parse(event.data);
          if (message.type === 'connected') {
            saveMcpWindowId(message.windowId);
            onState('connected');
            heartbeat = setInterval(() => {
              if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'status', status: api.getStatus() }));
            }, 2000);
            return;
          }
          if (message.type !== 'command' || typeof message.id !== 'string') throw new Error('INVALID_MESSAGE');
          if (busy) throw new Error('WINDOW_BUSY');
          busy = true;
          try {
            const result = await executeBridgeCommand(api, commandSchema.parse(message.command));
            const payload = JSON.stringify({ type: 'result', id: message.id, result });
            if (new Blob([payload]).size > MAX_BRIDGE_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
            if (connection.readyState === WebSocket.OPEN) {
              connection.send(payload);
              connection.send(JSON.stringify({ type: 'status', status: api.getStatus() }));
            }
          } catch (error) {
            if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'result', id: message.id,
              error: error instanceof Error ? error.message : 'COMMAND_FAILED' }));
          } finally { busy = false; }
        } catch { connection.close(1008, 'INVALID_MESSAGE'); }
      };
      connection.onerror = () => {}; // onclose owns reconnect and status.
      connection.onclose = () => {
        clearInterval(heartbeat);
        if (!stopped && Date.now() < session.expiresAt) { onState('disconnected'); retry = setTimeout(connect, 3000); }
      };
    } catch {
      if (!stopped && Date.now() < session.expiresAt) { onState('disconnected'); retry = setTimeout(connect, 3000); }
    }
  };
  void connect();
  return () => {
    stopped = true; abort.abort(); clearInterval(heartbeat); clearTimeout(retry);
    socket?.close(1000, 'DISABLED');
  };
}
