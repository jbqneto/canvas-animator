import type { CanvasDimensions, HistorySnapshot, VideoBackground } from '../types';

export const PROJECT_FORMAT = 'flashmotion-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.fmproj';

/** Everything needed to reopen a project. The background video file itself is not embedded. */
export interface ProjectState {
  name: string;
  fps: number;
  totalFrames: number;
  canvas: CanvasDimensions;
  videoBg: VideoBackground;
  content: Omit<HistorySnapshot, 'description'>;
}

interface ProjectFileV1 {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  project: Omit<ProjectState, 'videoBg'> & {
    /** Video URLs are session-only (blob:), so only the look of the background is kept. */
    videoBg: Omit<VideoBackground, 'url'> & { fileName?: string };
  };
}

export function serializeProject(state: ProjectState, videoFileName?: string): string {
  const { url: _url, ...videoBg } = state.videoBg;
  const file: ProjectFileV1 = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project: {
      ...state,
      // A video can't be reopened from a saved file: fall back to the color until it's reloaded
      videoBg: { ...videoBg, type: videoBg.type === 'upload' ? 'color' : videoBg.type, fileName: videoFileName },
    },
  };
  return JSON.stringify(file);
}

export class ProjectFileError extends Error {}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const asNumber = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Parses and validates a project file, filling fields added in later versions with defaults
 * (e.g. `actors` did not exist in the first snapshots).
 */
export function parseProject(text: string): ProjectState & { missingVideo?: string } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError('O arquivo não é um projeto válido (JSON inválido).');
  }
  if (data?.format !== PROJECT_FORMAT || !data.project) {
    throw new ProjectFileError('Este arquivo não é um projeto do FlashMotion Studio.');
  }
  if (asNumber(data.version, 0) > PROJECT_VERSION) {
    throw new ProjectFileError('Projeto salvo por uma versão mais nova do FlashMotion. Atualize o app.');
  }

  const p = data.project;
  const c = p.content ?? {};
  const frames: HistorySnapshot['frames'] = {};
  Object.entries(c.frames ?? {}).forEach(([k, v]: [string, any]) => {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || !v) return;
    frames[n] = {
      frameNumber: n,
      stickFigures: asArray(v.stickFigures),
      drawings: asArray(v.drawings),
      groups: asArray(v.groups),
    };
  });

  const canvasW = asNumber(p.canvas?.width, 1280);
  const canvasH = asNumber(p.canvas?.height, 720);
  const videoBg = p.videoBg ?? {};
  return {
    name: typeof p.name === 'string' && p.name ? p.name : 'Projeto sem título',
    fps: asNumber(p.fps, 24),
    totalFrames: Math.max(1, Math.round(asNumber(p.totalFrames, 60))),
    canvas: { width: canvasW, height: canvasH, preset: p.canvas?.preset ?? 'custom' },
    videoBg: {
      type: videoBg.type === 'preset' ? 'preset' : 'color',
      color: typeof videoBg.color === 'string' ? videoBg.color : '#0a0a0f',
      opacity: asNumber(videoBg.opacity, 1),
      playbackRate: 1,
      url: videoBg.type === 'preset' && typeof videoBg.url === 'string' ? videoBg.url : '',
    },
    missingVideo: typeof videoBg.fileName === 'string' ? videoBg.fileName : undefined,
    content: {
      frames,
      charts: asArray(c.charts),
      texts: asArray(c.texts),
      images: asArray(c.images),
      actors: asArray(c.actors),
      layers: asArray(c.layers),
      groups: asArray(c.groups),
    },
  };
}

/** File name without extension, used as the project name. */
export function projectNameFromFile(fileName: string): string {
  return fileName.replace(/\.fmproj$/i, '').replace(/\.json$/i, '') || 'Projeto sem título';
}
