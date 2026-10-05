import type { HistorySnapshot } from '../types';
import { parseProject } from '../project/projectFile';

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
}

export function createBrowserApi(adapter: AutomationAdapter) {
  let rendering = false;
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
    seek: (frame: number) => { validateFrame(frame); adapter.seek(frame); },
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
  });
}

export type BrowserAutomationApi = ReturnType<typeof createBrowserApi>;
declare global {
  interface Window { flashmotion?: BrowserAutomationApi }
}
