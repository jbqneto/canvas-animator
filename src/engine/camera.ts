import type { SceneCamera } from '../types';
import { sampleTrack, setKeyframe, type EasingName } from './keyframes';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;

export interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
  rotation: number;
}

export const DEFAULT_CAMERA: SceneCamera = { base: { panX: 0, panY: 0, zoom: 1, rotation: 0 }, tracks: {} };

const finiteOr = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finiteOr(zoom, 1)));

export function sampleCamera(camera: SceneCamera | undefined, frame: number): CameraState {
  const c = camera ?? DEFAULT_CAMERA;
  return {
    panX: finiteOr(sampleTrack(c.tracks.panX, frame, c.base.panX), 0),
    panY: finiteOr(sampleTrack(c.tracks.panY, frame, c.base.panY), 0),
    zoom: clampZoom(sampleTrack(c.tracks.zoom, frame, c.base.zoom)),
    rotation: finiteOr(sampleTrack(c.tracks.rotation, frame, c.base.rotation), 0),
  };
}

export const isIdentityCamera = (s: CameraState) => s.panX === 0 && s.panY === 0 && s.zoom === 1 && s.rotation === 0;

/** Leaves the context transformed so scene coordinates are drawn as the camera sees them. */
export function applyCamera(ctx: CanvasRenderingContext2D, s: CameraState, width: number, height: number): void {
  ctx.translate(width / 2, height / 2);
  ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.scale(s.zoom, s.zoom);
  ctx.translate(-(width / 2 + s.panX), -(height / 2 + s.panY));
}

interface Point {
  x: number;
  y: number;
}

/** Where a scene point lands on screen. */
export function sceneToScreen(s: CameraState, p: Point, width: number, height: number): Point {
  const a = (s.rotation * Math.PI) / 180;
  const dx = p.x - (width / 2 + s.panX);
  const dy = p.y - (height / 2 + s.panY);
  return {
    x: width / 2 + (dx * Math.cos(a) - dy * Math.sin(a)) * s.zoom,
    y: height / 2 + (dx * Math.sin(a) + dy * Math.cos(a)) * s.zoom,
  };
}

/** The scene point under a screen point (inverse of `sceneToScreen`). */
export function screenToScene(s: CameraState, p: Point, width: number, height: number): Point {
  const a = (s.rotation * Math.PI) / 180;
  const dx = (p.x - width / 2) / s.zoom;
  const dy = (p.y - height / 2) / s.zoom;
  return {
    x: width / 2 + s.panX + dx * Math.cos(a) + dy * Math.sin(a),
    y: height / 2 + s.panY - dx * Math.sin(a) + dy * Math.cos(a),
  };
}

export interface CameraMove {
  property: 'zoom' | 'panX' | 'panY' | 'rotation';
  from: number;
  to: number;
  startFrame: number;
  endFrame: number;
  easing?: EasingName;
}

/** Adds two keyframes (start → end) to one camera property. */
export function addCameraMove(camera: SceneCamera | undefined, move: CameraMove): SceneCamera {
  const c = camera ?? DEFAULT_CAMERA;
  const track = setKeyframe(c.tracks[move.property], move.startFrame, move.from, move.easing ?? 'linear');
  return { ...c, tracks: { ...c.tracks, [move.property]: setKeyframe(track, move.endFrame, move.to) } };
}
