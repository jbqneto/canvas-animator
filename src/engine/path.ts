/**
 * Motion paths (pure functions): the geometry of a drawn "rota"/guide and how to travel along it.
 * Travel is parameterized by arc length, so progress 0.5 is always half the distance.
 */
import type { MotionPath } from '../types';
import { catmullRom, EasingName, Track, Vec2 } from './keyframes';

export interface PathSampler {
  /** Dense polyline with cumulative distance `d` from the start. */
  samples: { x: number; y: number; d: number }[];
  length: number;
  /** Progress (0..1) at which each drawn point is reached. */
  anchorProgress: number[];
}

const SAMPLES_PER_SEGMENT = 32;
const cache = new WeakMap<MotionPath, PathSampler>();

/** Point on the segment from anchor i to i+1 at curve parameter u. */
function segmentPoint(points: Vec2[], i: number, u: number, smooth: boolean, closed: boolean): Vec2 {
  const n = points.length;
  const at = (k: number): Vec2 | undefined => (closed ? points[(k + n) % n] : points[k]);
  const p1 = at(i)!;
  const p2 = at(i + 1)!;
  if (!smooth) return { x: p1.x + (p2.x - p1.x) * u, y: p1.y + (p2.y - p1.y) * u };
  // Open ends: mirror the neighbour so the curve leaves/arrives heading at the next/previous point
  const p0 = at(i - 1) ?? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
  const p3 = at(i + 2) ?? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
  return catmullRom(p0, p1, p2, p3, u);
}

/** Samples the path once (memoized per immutable path object). */
export function samplePath(path: Pick<MotionPath, 'points' | 'smooth' | 'closed'>): PathSampler {
  const cached = cache.get(path as MotionPath);
  if (cached) return cached;
  const { points, smooth } = path;
  const closed = path.closed && points.length > 2;
  const samples: PathSampler['samples'] = [];
  const anchorProgress: number[] = [];
  if (points.length === 0) return { samples, length: 0, anchorProgress };

  samples.push({ ...points[0], d: 0 });
  const anchorDistances = [0];
  const segments = closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i++) {
    for (let s = 1; s <= SAMPLES_PER_SEGMENT; s++) {
      const p = segmentPoint(points, i, s / SAMPLES_PER_SEGMENT, smooth, closed);
      const prev = samples[samples.length - 1];
      samples.push({ x: p.x, y: p.y, d: prev.d + Math.hypot(p.x - prev.x, p.y - prev.y) });
    }
    anchorDistances.push(samples[samples.length - 1].d);
  }
  const length = samples[samples.length - 1].d;
  anchorDistances.forEach((d) => anchorProgress.push(length > 0 ? d / length : 0));
  const sampler = { samples, length, anchorProgress };
  cache.set(path as MotionPath, sampler);
  return sampler;
}

/** Position and direction of travel (degrees) at a progress 0..1 along the path. */
export function pointAtProgress(sampler: PathSampler, progress: number): Vec2 & { angle: number } {
  const { samples, length } = sampler;
  if (samples.length === 0) return { x: 0, y: 0, angle: 0 };
  if (samples.length === 1 || length === 0) return { x: samples[0].x, y: samples[0].y, angle: 0 };
  const target = Math.max(0, Math.min(1, progress)) * length;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d < target) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const t = b.d > a.d ? (target - a.d) / (b.d - a.d) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: directionAt(samples, lo) };
}

/** Direction of the first non-degenerate sample step at/after i (or before it at the very end). */
function directionAt(samples: PathSampler['samples'], i: number): number {
  for (let j = i; j < samples.length - 1; j++) {
    const dx = samples[j + 1].x - samples[j].x;
    const dy = samples[j + 1].y - samples[j].y;
    if (Math.hypot(dx, dy) > 1e-6) return (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  for (let j = Math.min(i, samples.length - 1); j > 0; j--) {
    const dx = samples[j].x - samples[j - 1].x;
    const dy = samples[j].y - samples[j - 1].y;
    if (Math.hypot(dx, dy) > 1e-6) return (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  return 0;
}

/** The part of the path from the start up to `progress` (for "reveal as it travels"). */
export function polylineUpTo(sampler: PathSampler, progress: number): Vec2[] {
  if (sampler.samples.length === 0 || progress <= 0) return [];
  const end = pointAtProgress(sampler, progress);
  const target = Math.min(1, progress) * sampler.length;
  const out: Vec2[] = sampler.samples.filter((s) => s.d < target).map(({ x, y }) => ({ x, y }));
  out.push({ x: end.x, y: end.y });
  return out;
}

/** Shortest distance from a point to the path (for selecting it on the stage). */
export function distanceToPath(sampler: PathSampler, p: Vec2): number {
  let best = Infinity;
  const s = sampler.samples;
  for (let i = 0; i < s.length - 1; i++) {
    const ax = s[i].x;
    const ay = s[i].y;
    const dx = s[i + 1].x - ax;
    const dy = s[i + 1].y - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
  }
  return s.length === 1 ? Math.hypot(p.x - s[0].x, p.y - s[0].y) : best;
}

export interface FollowTimingOptions {
  /** Progress at each drawn point (from `samplePath(...).anchorProgress`). */
  anchorProgress: number[];
  startFrame: number;
  endFrame: number;
  easing: EasingName;
  /** Frames to wait at each stop (0 = travel without stopping). */
  holdFrames: number;
  /** Progress values to stop at; defaults to every intermediate drawn point. */
  stopAt?: number[];
}

/**
 * Progress keyframes for travelling a path between two frames. Without holds: one eased move.
 * With holds: the actor stops at each intermediate point; travel time per leg is proportional to its
 * length, so the average speed is the same on every leg.
 */
export function buildFollowProgress(opts: FollowTimingOptions): Track<number> {
  const { startFrame, easing } = opts;
  const endFrame = Math.max(startFrame + 1, opts.endFrame);
  const stops = (opts.stopAt ?? opts.anchorProgress).filter((p) => p > 1e-6 && p < 1 - 1e-6);
  if (opts.holdFrames <= 0 || stops.length === 0) {
    return [
      { frame: startFrame, value: 0, easing },
      { frame: endFrame, value: 1 },
    ];
  }
  const hold = Math.min(opts.holdFrames, Math.floor((endFrame - startFrame) / (stops.length + 1)));
  const travel = endFrame - startFrame - hold * stops.length;
  const track: Track<number> = [{ frame: startFrame, value: 0, easing }];
  let frame = startFrame;
  let from = 0;
  stops.forEach((p) => {
    frame += Math.max(1, Math.round(travel * (p - from)));
    track.push({ frame, value: p, easing: 'linear' });
    frame += hold;
    track.push({ frame, value: p, easing });
    from = p;
  });
  track.push({ frame: Math.max(frame + 1, endFrame), value: 1 });
  return track;
}
