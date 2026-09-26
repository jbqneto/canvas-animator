/**
 * Keyframe engine (pure functions, no DOM).
 *
 * Model inspired by After Effects / Flash motion tweens:
 * - A track is a list of keyframes sorted by frame.
 * - The easing of a keyframe controls the segment that STARTS at it (Flash puts the tween on the
 *   starting keyframe; AE calls it "outgoing" temporal interpolation).
 * - Before the first key the track holds the first value; after the last key it holds the last value
 *   (Remotion's `extrapolate: 'clamp'`).
 * - Position is a separate 2D track so it can follow a smooth spatial path (AE "Auto Bezier"), with
 *   temporal easing applied along the path's arc length.
 */

export type EasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backOut'
  | 'elasticOut'
  | 'bounceOut'
  | 'hold';

export const EASING_OPTIONS: { id: EasingName; label: string }[] = [
  { id: 'easeInOut', label: 'Suave (entrada e saída)' },
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Acelerando' },
  { id: 'easeOut', label: 'Desacelerando' },
  { id: 'backOut', label: 'Passa e volta' },
  { id: 'elasticOut', label: 'Elástico' },
  { id: 'bounceOut', label: 'Quicando' },
  { id: 'hold', label: 'Segurar (salto)' },
];

export const DEFAULT_EASING: EasingName = 'easeInOut';

export interface Keyframe<T> {
  frame: number;
  value: T;
  /** Easing of the segment that starts at this keyframe. */
  easing?: EasingName;
}

export type Track<T> = Keyframe<T>[];

export interface Vec2 {
  x: number;
  y: number;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

/** Maps linear progress (0..1) to eased progress. May overshoot 1 for back/elastic. */
export function applyEasing(name: EasingName | undefined, t: number): number {
  const p = clamp01(t);
  switch (name) {
    case 'hold':
      return p < 1 ? 0 : 1;
    case 'easeIn':
      return p * p * p;
    case 'easeOut':
      return 1 - Math.pow(1 - p, 3);
    case 'easeInOut':
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    case 'backOut': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    }
    case 'elasticOut': {
      if (p === 0 || p === 1) return p;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
    }
    case 'bounceOut':
      return bounceOut(p);
    case 'linear':
    default:
      return p;
  }
}

/** Finds the segment containing `frame`: index of its starting key and eased progress inside it. */
function locate<T>(track: Track<T>, frame: number): { index: number; t: number } {
  const last = track.length - 1;
  if (frame <= track[0].frame) return { index: 0, t: 0 };
  if (frame >= track[last].frame) return { index: last, t: 0 };
  let i = 0;
  while (i < last && track[i + 1].frame <= frame) i++;
  const a = track[i];
  const b = track[i + 1];
  return { index: i, t: applyEasing(a.easing, (frame - a.frame) / (b.frame - a.frame)) };
}

/** Samples a numeric track; returns `fallback` when the track has no keys. */
export function sampleTrack(track: Track<number> | undefined, frame: number, fallback: number): number {
  if (!track || track.length === 0) return fallback;
  const { index, t } = locate(track, frame);
  const a = track[index];
  const b = track[index + 1];
  if (!b) return a.value;
  return a.value + (b.value - a.value) * t;
}

/** Inserts or replaces the key at `frame`. Keeps the old easing unless a new one is given. */
export function setKeyframe<T>(track: Track<T> | undefined, frame: number, value: T, easing?: EasingName): Track<T> {
  const list = track ? [...track] : [];
  const existing = list.findIndex((k) => k.frame === frame);
  if (existing !== -1) {
    list[existing] = { ...list[existing], value, ...(easing ? { easing } : {}) };
    return list;
  }
  list.push({ frame, value, easing: easing ?? DEFAULT_EASING });
  return list.sort((a, b) => a.frame - b.frame);
}

export function removeKeyframe<T>(track: Track<T> | undefined, frame: number): Track<T> {
  return (track ?? []).filter((k) => k.frame !== frame);
}

/** Moves a key to another frame (replacing any key already there). */
export function moveKeyframe<T>(track: Track<T> | undefined, from: number, to: number): Track<T> {
  const key = track?.find((k) => k.frame === from);
  if (!track || !key || from === to) return track ?? [];
  const rest = track.filter((k) => k.frame !== from && k.frame !== to);
  return [...rest, { ...key, frame: to }].sort((a, b) => a.frame - b.frame);
}

export function setKeyframeEasing<T>(track: Track<T> | undefined, frame: number, easing: EasingName): Track<T> {
  return (track ?? []).map((k) => (k.frame === frame ? { ...k, easing } : k));
}

export function hasKeyframeAt<T>(track: Track<T> | undefined, frame: number): boolean {
  return !!track?.some((k) => k.frame === frame);
}

// ================= SPATIAL PATH (POSITION) =================

/**
 * Centripetal Catmull-Rom point between p1 and p2 (u in 0..1). The centripetal variant (alpha = 0.5)
 * never forms cusps or self-loops on tight turns, which matters for routes with close stops.
 */
function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const knot = (a: Vec2, b: Vec2) => Math.max(1e-4, Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;

  const lerp = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const w = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

const ARC_SAMPLES = 24;

/** Point on segment `i` (between key i and i+1) at raw curve parameter u. */
function segmentPoint(points: Vec2[], i: number, u: number, smooth: boolean): Vec2 {
  const p1 = points[i];
  const p2 = points[i + 1];
  if (!smooth) return { x: p1.x + (p2.x - p1.x) * u, y: p1.y + (p2.y - p1.y) * u };
  // Mirror the neighbours at the ends so the curve starts/ends heading at the next/previous key
  const p0 = points[i - 1] ?? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
  const p3 = points[i + 2] ?? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
  return catmullRom(p0, p1, p2, p3, u);
}

/**
 * Converts a distance fraction (0..1 along the segment) into the curve parameter, so linear easing
 * means constant speed along the drawn path.
 */
function arcLengthParam(points: Vec2[], i: number, fraction: number, smooth: boolean): number {
  if (!smooth || fraction <= 0 || fraction >= 1) return clamp01(fraction);
  const lengths = [0];
  let prev = segmentPoint(points, i, 0, smooth);
  for (let s = 1; s <= ARC_SAMPLES; s++) {
    const p = segmentPoint(points, i, s / ARC_SAMPLES, smooth);
    lengths.push(lengths[s - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const target = fraction * lengths[ARC_SAMPLES];
  let s = 1;
  while (s < ARC_SAMPLES && lengths[s] < target) s++;
  const span = lengths[s] - lengths[s - 1] || 1;
  return (s - 1 + (target - lengths[s - 1]) / span) / ARC_SAMPLES;
}

export interface PathSample extends Vec2 {
  /** Direction of travel in degrees (0 = pointing right, clockwise positive, canvas convention). */
  angle: number;
}

/**
 * Samples a 2D position track along its spatial path.
 * `smooth` = curved path through the keys (Auto Bezier); otherwise straight lines between keys.
 */
export function samplePosition(
  track: Track<Vec2> | undefined,
  frame: number,
  fallback: Vec2,
  smooth = true
): PathSample {
  if (!track || track.length === 0) return { ...fallback, angle: 0 };
  const points = track.map((k) => k.value);
  if (track.length === 1) return { ...points[0], angle: 0 };

  const last = track.length - 1;
  let i: number;
  let fraction: number;
  if (frame <= track[0].frame) {
    i = 0;
    fraction = 0;
  } else if (frame >= track[last].frame) {
    i = last - 1;
    fraction = 1;
  } else {
    const loc = locate(track, frame);
    i = loc.index;
    fraction = loc.t;
  }

  // back/elastic easings overshoot: extrapolate along the segment direction instead of the curve
  if (fraction > 1 || fraction < 0) {
    const a = points[i];
    const b = points[i + 1];
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, angle };
  }

  const u = arcLengthParam(points, i, fraction, smooth);
  const p = segmentPoint(points, i, u, smooth);
  return { x: p.x, y: p.y, angle: travelAngle(points, i, u, smooth) };
}

const isStill = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y) < 1e-6;

/** Direction of travel at parameter u of segment i (degrees), by finite difference. */
function segmentAngle(points: Vec2[], i: number, u: number, smooth: boolean): number {
  const eps = 0.01;
  const ua = u + eps <= 1 ? u : u - eps;
  const pa = segmentPoint(points, i, ua, smooth);
  const pb = segmentPoint(points, i, ua + eps, smooth);
  return (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
}

/**
 * Like segmentAngle, but a pause (two keys at the same place) keeps the heading it arrived with,
 * or the one it will leave with when there is no previous movement, instead of snapping to 0°.
 */
function travelAngle(points: Vec2[], i: number, u: number, smooth: boolean): number {
  if (!isStill(points[i], points[i + 1])) return segmentAngle(points, i, u, smooth);
  for (let j = i - 1; j >= 0; j--) {
    if (!isStill(points[j], points[j + 1])) return segmentAngle(points, j, 1, smooth);
  }
  for (let j = i + 1; j < points.length - 1; j++) {
    if (!isStill(points[j], points[j + 1])) return segmentAngle(points, j, 0, smooth);
  }
  return 0;
}

/** Polyline approximating the whole path, for drawing the motion guide in the editor. */
export function pathPolyline(track: Track<Vec2> | undefined, smooth = true, samplesPerSegment = 20): Vec2[] {
  if (!track || track.length === 0) return [];
  const points = track.map((k) => k.value);
  if (points.length === 1) return [points[0]];
  const out: Vec2[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    for (let s = 1; s <= samplesPerSegment; s++) {
      out.push(segmentPoint(points, i, s / samplesPerSegment, smooth));
    }
  }
  return out;
}
