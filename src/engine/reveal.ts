/** Draw-on reveal: progress of the outline trace and of the fill that follows. Pure. */
import type { ShapeStyle } from '../types';
import { arrowPolygon, fittedRadius } from './shapes';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const usable = (frames: unknown): frames is number => typeof frames === 'number' && Number.isFinite(frames) && frames > 0;

/** Frames of a `ShapeStyle.draw` value, or 0 when it is missing or invalid. */
export function validDrawFrames(draw: unknown): number {
  const frames = (draw as { frames?: unknown } | null | undefined)?.frames;
  return usable(frames) ? frames : 0;
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** 0..1 along the outline at `frame`; 1 (no effect) when `frames` is not a positive number. */
export function drawProgress(startFrame: number, frames: number | undefined, frame: number): number {
  if (!usable(frames)) return 1;
  return easeInOut(clamp01((frame - startFrame) / frames));
}

/** 0..1 opacity of the fill: 0 while tracing, then a fade of round(frames / 2) frames (at least 1). */
export function fillAlpha(startFrame: number, frames: number | undefined, frame: number): number {
  if (!usable(frames)) return 1;
  const fade = Math.max(1, Math.round(frames / 2));
  return clamp01((frame - (startFrame + frames)) / fade);
}

/** Length of the shape's outline in pixels, at scale 1 (the dash pattern needs it). */
export function shapeOutlineLength(style: ShapeStyle, width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return style.type === 'line' && width > 0 ? width : 0;
  switch (style.type) {
    case 'line':
      return width;
    case 'ellipse': {
      const a = width / 2;
      const b = height / 2; // Ramanujan's approximation
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    case 'arrow': {
      const pts = arrowPolygon(width, height);
      return pts.reduce((sum, p, i) => sum + Math.hypot(p.x - pts[(i + 1) % pts.length].x, p.y - pts[(i + 1) % pts.length].y), 0);
    }
    default: {
      const r = fittedRadius(style.radius, width, height);
      return 2 * (width + height) - 8 * r + 2 * Math.PI * r;
    }
  }
}
