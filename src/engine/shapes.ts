/**
 * Vector shapes of shape actors: default styles and their outline geometry (pure), drawn centered on
 * the actor's anchor inside its width × height box, so they move/scale/rotate like any actor.
 */
import type { ActorOverlay, ShapeStyle, ShapeType } from '../types';
import type { Vec2 } from './keyframes';
import { createActor } from './actor';

export const SHAPE_TYPES: ShapeType[] = ['rect', 'ellipse', 'arrow', 'line'];

export function defaultShapeStyle(type: ShapeType, color = '#38bdf8'): ShapeStyle {
  return type === 'line'
    ? { type, fill: color, stroke: color, strokeWidth: 6, radius: 0 }
    : { type, fill: color, stroke: '#ffffff', strokeWidth: 0, radius: type === 'rect' ? 16 : 0 };
}

/** Arrow pointing right, filling the box (shaft 34% of the height, head up to 45% of the width). */
export function arrowPolygon(width: number, height: number): Vec2[] {
  const shaft = height * 0.34;
  const head = Math.min(width * 0.45, height * 1.1);
  const x0 = -width / 2;
  const x1 = width / 2 - head;
  const x2 = width / 2;
  return [
    { x: x0, y: -shaft / 2 },
    { x: x1, y: -shaft / 2 },
    { x: x1, y: -height / 2 },
    { x: x2, y: 0 },
    { x: x1, y: height / 2 },
    { x: x1, y: shaft / 2 },
    { x: x0, y: shaft / 2 },
  ];
}

/** Corner radius that fits the box. */
export const fittedRadius = (radius: number, width: number, height: number) =>
  Math.max(0, Math.min(radius, width / 2, height / 2));

export function createShapeActor(params: {
  id: string;
  name: string;
  style: ShapeStyle;
  width: number;
  height: number;
  x: number;
  y: number;
  startFrame: number;
  durationFrames: number;
}): ActorOverlay {
  const { style, ...rest } = params;
  // A line is drawn along the width; its box stays tall enough to be clicked
  const height = style.type === 'line' ? Math.max(params.height, style.strokeWidth, 16) : params.height;
  return { ...createActor({ ...rest, src: '', height }), kind: 'shape', shape: { ...style } };
}

/** Keeps a shape actor valid when read from a file (missing or odd fields get defaults). */
export function normalizeShape(actor: ActorOverlay): ActorOverlay {
  if (actor.kind !== 'shape') return actor;
  const type = SHAPE_TYPES.includes(actor.shape?.type as ShapeType) ? (actor.shape!.type as ShapeType) : 'rect';
  const base = defaultShapeStyle(type);
  const s: Partial<ShapeStyle> = actor.shape ?? {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    ...actor,
    src: '',
    shape: {
      type,
      fill: typeof s.fill === 'string' ? s.fill : base.fill,
      stroke: typeof s.stroke === 'string' ? s.stroke : base.stroke,
      strokeWidth: num(s.strokeWidth, base.strokeWidth),
      radius: num(s.radius, base.radius),
    },
  };
}
