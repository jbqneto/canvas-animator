import type { CanvasDimensions, HistorySnapshot, VideoBackground } from '../types';
import { t } from '../i18n';
import type { ProjectState } from './projectFile';

export const NEW_PROJECT_CANVAS: CanvasDimensions = { width: 1280, height: 720, preset: 'youtube-720p' };
export const NEW_PROJECT_VIDEO: VideoBackground = { type: 'color', url: '', color: '#0a0a0f', opacity: 1, playbackRate: 1 };

/** A blank document, deliberately separate from the animated demo shown on first launch. */
export function createNewProject(): ProjectState {
  const content: Omit<HistorySnapshot, 'description'> = {
    frames: {}, charts: [], texts: [], images: [], actors: [], sticks: [], paths: [], audio: [], markers: [],
    layers: [
      { id: 'layer-drawings', name: t('app.layer.drawings'), type: 'drawing', visible: true, locked: false, color: '#38bdf8' },
      { id: 'layer-video', name: t('app.layer.background'), type: 'video', visible: true, locked: false, color: '#a855f7' },
    ],
  };
  return { name: t('project.untitled'), fps: 24, totalFrames: 60, canvas: NEW_PROJECT_CANVAS, videoBg: NEW_PROJECT_VIDEO, content };
}
