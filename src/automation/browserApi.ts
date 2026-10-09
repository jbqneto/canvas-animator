import type { HistorySnapshot } from '../types';
import { parseProject } from '../project/projectFile';
import { translate } from '../i18n';
import { TEMPLATES } from '../templates/library';
import { coerceTemplateValues, mergeTemplateOutput } from '../templates/insert';
import { defaultValues } from '../templates/types';

export interface AutomationStatus {
  name: string;
  frame: number;
  fps: number;
  totalFrames: number;
  playing: boolean;
  dirty: boolean;
  ready: boolean;
  exporting: boolean;
}

export interface AutomationAdapter {
  status(): AutomationStatus;
  project(): string;
  replaceContent(content: Omit<HistorySnapshot, 'description'>): void;
  seek(frame: number): void;
  play(playing: boolean): void;
  render(frame: number): Promise<string>;
  /** Replace the whole project (settings + content) from .fmproj text, discarding unsaved edits. */
  loadProject(text: string): void;
  /** Render the given frames into one labeled PNG grid (data URL). */
  contactSheet(frames: number[], options: { columns: number; cellWidth: number }): Promise<string>;
  /** Render the timeline (or a range) to a video file without the export dialog. */
  exportVideo(options: { format: 'mp4' | 'webm-alpha'; startFrame?: number; endFrame?: number; onProgress: (p: number) => void }): Promise<{ blob: Blob; extension: string }>;
}

export interface ExportJob {
  id: string;
  state: 'running' | 'done' | 'error';
  progress: number;
  error?: string;
  extension?: string;
  size?: number;
}

export function createBrowserApi(adapter: AutomationAdapter) {
  let rendering = false;
  let job: ExportJob | null = null;
  let jobBytes: Uint8Array | null = null;
  const assertReady = () => {
    const status = adapter.status();
    if (!status.ready) throw new Error('RECOVERY_PENDING');
    if (status.exporting) throw new Error('EXPORT_IN_PROGRESS');
    if (rendering) throw new Error('RENDER_IN_PROGRESS');
    return status;
  };
  const validateFrame = (frame: number) => {
    const { totalFrames } = assertReady();
    if (!Number.isSafeInteger(frame) || frame < 1 || frame > totalFrames) throw new Error('INVALID_FRAME');
  };
  return Object.freeze({
    version: 1 as const,
    getStatus: () => ({ ...adapter.status() }),
    // JSON roundtrip provides a detached object, never a mutable reference to React state.
    getProject: () => JSON.parse(adapter.project()),
    replaceContent: (content: unknown) => {
      assertReady();
      if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('INVALID_CONTENT');
      const file = JSON.parse(adapter.project());
      file.project.content = content;
      const validated = parseProject(JSON.stringify(file));
      adapter.replaceContent(validated.content);
    },
    /** Replaces the whole scene camera (null removes it) as one undoable step. */
    setCamera: (camera: unknown) => {
      assertReady();
      const file = JSON.parse(adapter.project());
      if (camera === null) delete file.project.content.camera;
      else file.project.content.camera = camera;
      adapter.replaceContent(parseProject(JSON.stringify(file)).content);
    },
    listTemplates: () =>
      TEMPLATES.map((tpl) => ({
        id: tpl.id,
        category: tpl.category,
        name: translate('en-US', tpl.nameKey),
        description: translate('en-US', tpl.descriptionKey),
        params: tpl.params.map((p) => ({
          key: p.key,
          type: p.type,
          label: translate('en-US', p.labelKey),
          default: p.type === 'text' || p.type === 'lines' ? translate('en-US', p.defaultKey) : p.default,
          ...(p.type === 'number' ? { min: p.min, max: p.max, step: p.step } : {}),
          ...(p.type === 'select' ? { options: p.options.map((o) => o.value) } : {}),
        })),
      })),
    /** Inserts a built-in template at `startFrame` (default: the current frame) as one undoable edit. */
    applyTemplate: (templateId: string, values: Record<string, unknown> = {}, startFrame?: number) => {
      const status = assertReady();
      const template = TEMPLATES.find((t) => t.id === templateId);
      if (!template) throw new Error('UNKNOWN_TEMPLATE');
      const start = startFrame ?? status.frame;
      validateFrame(start);
      const merged = coerceTemplateValues(template, values, defaultValues(template, (k) => translate('en-US', k)));
      const file = JSON.parse(adapter.project());
      const { canvas, fps, totalFrames } = file.project;
      const out = template.build(merged, {
        width: canvas.width, height: canvas.height, fps, startFrame: start, idPrefix: `tpl-${template.id}-${Date.now()}`,
      });
      file.project.content = mergeTemplateOutput(file.project.content, out);
      adapter.replaceContent(parseProject(JSON.stringify(file)).content);
      return {
        templateId,
        createdIds: [...out.texts, ...out.charts, ...out.actors, ...out.paths].map((o) => o.id),
        startFrame: start,
        endFrame: out.endFrame,
        totalFrames,
        fitsTimeline: out.endFrame <= totalFrames,
      };
    },
    seek:(frame: number) => { validateFrame(frame); adapter.seek(frame); },
    setPlaying: (playing: boolean) => {
      assertReady();
      if (typeof playing !== 'boolean') throw new Error('INVALID_PLAYBACK');
      adapter.play(playing);
    },
    renderFrame: async (frame: number) => {
      validateFrame(frame);
      if (adapter.status().playing) throw new Error('PLAYBACK_ACTIVE');
      rendering = true;
      try { return await adapter.render(frame); }
      finally { rendering = false; }
    },
    renderContactSheet: async (frames: number[], options: { columns?: number; cellWidth?: number } = {}) => {
      if (!Array.isArray(frames) || frames.length < 1 || frames.length > 24) throw new Error('INVALID_FRAMES');
      frames.forEach(validateFrame);
      const columns = options.columns ?? 3;
      const cellWidth = options.cellWidth ?? 480;
      if (!Number.isInteger(columns) || columns < 1 || columns > 6 || !Number.isInteger(cellWidth) || cellWidth < 160 || cellWidth > 960) {
        throw new Error('INVALID_SHEET_OPTIONS');
      }
      if (adapter.status().playing) throw new Error('PLAYBACK_ACTIVE');
      rendering = true;
      try { return await adapter.contactSheet(frames, { columns, cellWidth }); }
      finally { rendering = false; }
    },
    loadProject: (text: unknown) => {
      if (typeof text !== 'string') throw new Error('INVALID_PROJECT');
      const status = adapter.status();
      if (status.exporting || job?.state === 'running') throw new Error('EXPORT_IN_PROGRESS');
      if (rendering) throw new Error('RENDER_IN_PROGRESS');
      parseProject(text); // validate before touching the editor
      adapter.loadProject(text);
    },
    /** Starts a background export; poll exportStatus, then read the bytes with exportChunk. */
    startExport: (options: { format?: 'mp4' | 'webm-alpha'; startFrame?: number; endFrame?: number } = {}) => {
      assertReady();
      if (job?.state === 'running') throw new Error('EXPORT_IN_PROGRESS');
      const current: ExportJob = { id: crypto.randomUUID(), state: 'running', progress: 0 };
      job = current; jobBytes = null;
      adapter.exportVideo({ format: options.format ?? 'mp4', startFrame: options.startFrame, endFrame: options.endFrame,
        onProgress: (p) => { current.progress = p; } })
        .then(async ({ blob, extension }) => {
          jobBytes = new Uint8Array(await blob.arrayBuffer());
          Object.assign(current, { state: 'done', progress: 1, extension, size: jobBytes.length });
        })
        .catch((error) => Object.assign(current, { state: 'error', error: error instanceof Error ? error.message : String(error) }));
      return { ...current };
    },
    exportStatus: () => (job ? { ...job } : null),
    exportChunk: (offset: number, length: number) => {
      if (!job || job.state !== 'done' || !jobBytes) throw new Error('NO_EXPORT_READY');
      const slice = jobBytes.subarray(offset, Math.min(jobBytes.length, offset + length));
      let binary = '';
      for (let i = 0; i < slice.length; i += 0x8000) binary += String.fromCharCode(...slice.subarray(i, i + 0x8000));
      return { offset, size: jobBytes.length, data: btoa(binary) };
    },
  });
}

export type BrowserAutomationApi = ReturnType<typeof createBrowserApi>;
declare global {
  interface Window { flashmotion?: BrowserAutomationApi }
}
