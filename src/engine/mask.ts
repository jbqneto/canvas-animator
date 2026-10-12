/** Masks: a shape actor cuts another object. Pure geometry; the renderer applies it with `ctx.clip`. */
import type { ActorOverlay, Animated, MotionPath } from '../types';
import { isActorOnScreen, sampleActor, type ActorState } from './actor';
import type { Vec2 } from './keyframes';
import { arrowPolygon, fittedRadius } from './shapes';

export interface ResolvedMask {
  shape: ActorOverlay;
  state: ActorState;
  mode: 'inside' | 'outside';
}

const ELLIPSE_POINTS = 64;
const CORNER_STEPS = 12;

/** The mask that applies to `target` at `frame`, or null (drawn whole) when it is missing or not usable. */
export function resolveMask(
  target: Animated & { id?: string },
  actors: ActorOverlay[],
  frame: number,
  paths: MotionPath[] = []
): ResolvedMask | null {
  const ref = target.mask;
  if (!ref || (ref.mode !== 'inside' && ref.mode !== 'outside') || ref.actorId === target.id) return null;
  const shape = actors.find((a) => a.id === ref.actorId);
  if (!shape || shape.kind !== 'shape' || !shape.shape || shape.shape.type === 'line') return null;
  if (!isActorOnScreen(shape, frame)) return null;
  const state = sampleActor(shape, frame, paths);
  if (![state.x, state.y, state.scale, state.rotation].every(Number.isFinite)) return null;
  return { shape, state, mode: ref.mode };
}

/** Outline of the shape in its own space (centered on the anchor), at scale 1. */
function localOutline(shape: ActorOverlay): Vec2[] {
  const w = shape.width;
  const h = shape.height;
  const style = shape.shape!;
  if (style.type === 'ellipse') {
    return Array.from({ length: ELLIPSE_POINTS }, (_, i) => {
      const a = (2 * Math.PI * i) / ELLIPSE_POINTS;
      return { x: (Math.cos(a) * w) / 2, y: (Math.sin(a) * h) / 2 };
    });
  }
  if (style.type === 'arrow') return arrowPolygon(w, h);
  const r = fittedRadius(style.radius, w, h);
  if (r <= 0) return [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];
  // Corners clockwise from top-right: [center, first angle in degrees]
  const corners: [Vec2, number][] = [
    [{ x: w / 2 - r, y: -h / 2 + r }, -90],
    [{ x: w / 2 - r, y: h / 2 - r }, 0],
    [{ x: -w / 2 + r, y: h / 2 - r }, 90],
    [{ x: -w / 2 + r, y: -h / 2 + r }, 180],
  ];
  return corners.flatMap(([c, from]) =>
    Array.from({ length: CORNER_STEPS + 1 }, (_, i) => {
      const a = ((from + (90 * i) / CORNER_STEPS) * Math.PI) / 180;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    })
  );
}

/** Mask contours in scene coordinates: translate, rotate, then scale/flip, like the shape is drawn. */
export function maskPath(shape: ActorOverlay, state: ActorState): Vec2[][] {
  const sx = state.scale * (shape.flipX ? -1 : 1);
  const sy = state.scale;
  const rad = (state.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    localOutline(shape).map((p) => {
      const x = p.x * sx;
      const y = p.y * sy;
      return { x: state.x + x * cos - y * sin, y: state.y + x * sin + y * cos };
    }),
  ];
}

type WithObjects = { actors: Animated[]; sticks?: Animated[]; charts: Animated[]; texts: Animated[] };

/** Drops the `mask` of every object that pointed at `actorId` (deleting a mask actor). Other objects are untouched. */
export function clearMaskRefs<S extends WithObjects>(scene: S, actorId: string): S {
  const clean = <T extends Animated>(list: T[]): T[] =>
    list.map((o) => {
      if (o.mask?.actorId !== actorId) return o;
      const { mask: _drop, ...rest } = o;
      return rest as T;
    });
  const next = { ...scene, actors: clean(scene.actors), charts: clean(scene.charts), texts: clean(scene.texts) };
  if (scene.sticks) next.sticks = clean(scene.sticks);
  return next;
}
