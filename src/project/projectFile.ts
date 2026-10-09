import type { UserPose } from '../utils/userPoses';
import type { ActorOverlay, AudioClip, Marker, CanvasDimensions, HistorySnapshot, SceneCamera, StickActor, VideoBackground } from '../types';
import { CANVAS_PRESETS } from '../types';
import { t } from '../i18n';
import { migrateChart, migrateText } from '../engine/overlays';
import { normalizeShape } from '../engine/shapes';
import { migrateFrameSticks, withStickLayers } from '../engine/stickActor';
import { clampZoom } from '../engine/camera';
import { EASING_NAMES, type EasingName, type Track } from '../engine/keyframes';

export const PROJECT_FORMAT = 'flashmotion-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.fmproj';
export const MAX_PROJECT_FRAMES = 1_000_000;

/** Everything needed to reopen a project. The background video file itself is not embedded. */
export interface ProjectState {
  name: string;
  fps: number;
  totalFrames: number;
  canvas: CanvasDimensions;
  videoBg: VideoBackground;
  content: Omit<HistorySnapshot, 'description'>;
  /** The user's saved poses ("My poses") at save time, so they travel with the file. */
  poses?: UserPose[];
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
const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Missing settings are supported for older files; supplied invalid settings are not repaired silently. */
function setting(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ProjectFileError(t('project.error.invalidSettings'));
  }
  return value;
}

function validateContent(content: Record<string, any>) {
  for (const key of ['charts', 'texts', 'images', 'actors', 'paths', 'layers', 'groups']) {
    const items = content[key];
    if (items !== undefined && (!Array.isArray(items) || items.some((item) => !isRecord(item)))) {
      throw new ProjectFileError(t('project.error.invalidContent'));
    }
  }
  for (const key of ['sticks', 'audio', 'markers']) {
    if (content[key] !== undefined && !Array.isArray(content[key])) {
      throw new ProjectFileError(t('project.error.invalidContent'));
    }
  }
  if (content.frames !== undefined && !isRecord(content.frames)) {
    throw new ProjectFileError(t('project.error.invalidContent'));
  }
  if (content.camera !== undefined && !isRecord(content.camera)) {
    throw new ProjectFileError(t('project.error.invalidContent'));
  }
}

/** Markers with a valid frame, sorted; missing labels/colors get defaults. */
function parseMarkers(value: unknown): Marker[] {
  return asArray<any>(value)
    .filter((m) => m && Number.isFinite(m.frame))
    .map((m, i) => ({
      id: typeof m.id === 'string' ? m.id : `marker-${i}`,
      frame: Math.max(1, Math.round(m.frame)),
      label: typeof m.label === 'string' ? m.label : '',
      color: typeof m.color === 'string' ? m.color : '#f59e0b',
    }))
    .sort((a, b) => a.frame - b.frame);
}

/** A camera with defaults for missing fields; junk keys are dropped and zoom is limited. */
function parseCamera(value: unknown): SceneCamera | undefined {
  if (!isRecord(value)) return undefined;
  const base = isRecord(value.base) ? value.base : {};
  const tracks = isRecord(value.tracks) ? value.tracks : {};
  const track = (raw: unknown): Track<number> | undefined => {
    const keys = asArray<any>(raw)
      .filter((k) => isRecord(k) && Number.isFinite(k.frame) && Number.isFinite(k.value))
      .map((k) => ({
        frame: Math.max(1, Math.round(k.frame)),
        value: k.value as number,
        ...(EASING_NAMES.includes(k.easing as EasingName) ? { easing: k.easing as EasingName } : {}),
      }))
      .sort((a, b) => a.frame - b.frame);
    return keys.length ? keys : undefined;
  };
  return {
    base: {
      panX: asNumber(base.panX, 0),
      panY: asNumber(base.panY, 0),
      zoom: clampZoom(asNumber(base.zoom, 1)),
      rotation: asNumber(base.rotation, 0),
    },
    tracks: { panX: track(tracks.panX), panY: track(tracks.panY), zoom: track(tracks.zoom), rotation: track(tracks.rotation) },
  };
}

/** Audio clips with the timing fields repaired; clips without data are dropped. */
function parseAudio(value: unknown): AudioClip[] {
  return asArray<any>(value)
    .filter((c) => c && typeof c.src === 'string' && c.src.startsWith('data:'))
    .map((c, i) => {
      const sourceDuration = Math.max(0, asNumber(c.sourceDuration, 0));
      const offset = Math.min(sourceDuration, Math.max(0, asNumber(c.offset, 0)));
      return {
        id: typeof c.id === 'string' ? c.id : `audio-${i}`,
        name: typeof c.name === 'string' ? c.name : `audio-${i + 1}`,
        src: c.src,
        sourceDuration,
        startFrame: Math.max(1, Math.round(asNumber(c.startFrame, 1))),
        offset,
        duration: Math.min(sourceDuration - offset, Math.max(0, asNumber(c.duration, sourceDuration - offset))),
        volume: Math.min(2, Math.max(0, asNumber(c.volume, 1))),
        muted: c.muted === true,
      };
    });
}

/** Stick actors with the fields a figure needs; the pose track defaults to empty (rest pose). */
function parseSticks(value: unknown): StickActor[] {
  return asArray<any>(value)
    .filter((s) => s && typeof s.id === 'string' && s.joints && Array.isArray(s.bones) && s.base)
    .map((s) => ({
      ...s,
      tracks: s.tracks ?? {},
      poses: asArray(s.poses),
      smoothPath: s.smoothPath !== false,
      orientToPath: s.orientToPath === true,
    }));
}

/** Saved poses with a name and joints that have numeric positions; anything else is dropped. */
function parseUserPoses(value: unknown): UserPose[] {
  return asArray<any>(value)
    .filter((p) => p && typeof p.name === 'string' && p.name.trim() && p.joints && typeof p.joints === 'object')
    .map((p, i) => {
      const joints: UserPose['joints'] = {};
      Object.entries(p.joints as Record<string, any>).forEach(([id, j]) => {
        if (j && Number.isFinite(j.x) && Number.isFinite(j.y)) joints[id] = { ...j, id };
      });
      return { id: typeof p.id === 'string' ? p.id : `pose-${i}`, name: p.name.trim(), joints };
    })
    .filter((p) => Object.keys(p.joints).length > 0);
}

/**
 * Parses and validates a project file, filling fields added in later versions with defaults
 * (e.g. `actors` did not exist in the first snapshots).
 */
export function parseProject(text: string): ProjectState & { missingVideo?: string } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError(t('project.error.invalidJson'));
  }
  if (data?.format !== PROJECT_FORMAT || !isRecord(data.project)) {
    throw new ProjectFileError(t('project.error.notProject'));
  }
  if (asNumber(data.version, 0) > PROJECT_VERSION) {
    throw new ProjectFileError(t('project.error.newerVersion'));
  }

  const p = data.project;
  if ((p.content !== undefined && !isRecord(p.content)) ||
      (p.canvas !== undefined && !isRecord(p.canvas)) ||
      (p.videoBg !== undefined && !isRecord(p.videoBg))) {
    throw new ProjectFileError(t('project.error.invalidContent'));
  }
  const c = p.content ?? {};
  validateContent(c);
  // 8K per side is the maximum supported stage; at least 2 pixels for even-sized video encoding.
  const canvasW = setting(p.canvas?.width, 1280, 2, 8192);
  const canvasH = setting(p.canvas?.height, 720, 2, 8192);
  const fps = setting(p.fps, 24, 1, 120);
  const totalFrames = setting(p.totalFrames, 60, 1, MAX_PROJECT_FRAMES);
  const frames: HistorySnapshot['frames'] = {};
  Object.entries(c.frames ?? {}).forEach(([k, v]: [string, any]) => {
    const n = Number(k);
    if (!Number.isSafeInteger(n) || n < 1) return;
    if (!isRecord(v) || ['stickFigures', 'drawings', 'groups'].some((key) =>
      v[key] !== undefined && (!Array.isArray(v[key]) || v[key].some((item: unknown) => !isRecord(item))))) {
      throw new ProjectFileError(t('project.error.invalidContent'));
    }
    frames[n] = {
      frameNumber: n,
      stickFigures: asArray(v.stickFigures),
      drawings: asArray(v.drawings),
      groups: asArray(v.groups),
    };
  });

  // Older files kept a copy of each stick figure per frame: turned into stick actors with pose keys
  const sticks = parseSticks(c.sticks);
  const legacy = migrateFrameSticks(frames);
  legacy.sticks.forEach((s) => {
    if (!sticks.some((x) => x.id === s.id)) sticks.push(s);
  });

  const videoBg = p.videoBg ?? {};
  return {
    name: typeof p.name === 'string' && p.name ? p.name : t('project.untitled'),
    fps,
    totalFrames,
    canvas: { width: canvasW, height: canvasH, preset: CANVAS_PRESETS.some((preset) =>
      preset.id === p.canvas?.preset && preset.width === canvasW && preset.height === canvasH)
      ? p.canvas.preset : 'custom' },
    videoBg: {
      type: videoBg.type === 'preset' ? 'preset' : 'color',
      color: typeof videoBg.color === 'string' ? videoBg.color : '#0a0a0f',
      opacity: asNumber(videoBg.opacity, 1),
      playbackRate: 1,
      url: videoBg.type === 'preset' && typeof videoBg.url === 'string' ? videoBg.url : '',
    },
    missingVideo: typeof videoBg.fileName === 'string' ? videoBg.fileName : undefined,
    poses: parseUserPoses(p.poses),
    content: {
      frames: legacy.frames,
      sticks,
      // Older files stored charts/texts with x/y and a P1→P2 tween: converted to the keyframe model
      charts: asArray(c.charts).map(migrateChart),
      texts: asArray(c.texts).map(migrateText),
      images: asArray(c.images),
      actors: asArray<ActorOverlay>(c.actors).map(normalizeShape),
      paths: asArray(c.paths),
      audio: parseAudio(c.audio),
      markers: parseMarkers(c.markers),
      camera: parseCamera(c.camera),
      layers: withStickLayers(asArray(c.layers), sticks),
      groups: asArray(c.groups),
    },
  };
}

/** File name without extension, used as the project name. */
export function projectNameFromFile(fileName: string): string {
  return fileName.replace(/\.fmproj$/i, '').replace(/\.json$/i, '') || t('project.untitled');
}
