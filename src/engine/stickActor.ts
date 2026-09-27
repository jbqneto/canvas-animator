/**
 * Stick figures as animated objects (pure): the pose track (keys interpolated bone by bone, with the
 * easing of the key that starts each segment), the stopwatch rule for poses, key operations that
 * include the pose track, and the migration from the old "one copy per frame" storage.
 */
import type { DrawingStroke, FrameData, Joint, StickActor, StickFigure, StickPose, StudioLayer } from '../types';
import { actorKeyframes, moveActorKeys, sampleActor, shiftActorTime, staticMotion } from './actor';
import { applyEasing, EasingName, moveKeyframe, removeKeyframe, setKeyframe, Track } from './keyframes';
import { interpolateStickPose } from './stickRig';

/** The figure in its own space (origin = anchor, scale 1), as the rig functions expect it. */
export function localFigure(stick: StickActor, joints: StickPose = stick.joints): StickFigure {
  return {
    id: stick.id,
    name: stick.name,
    color: stick.color,
    thickness: stick.thickness,
    scale: 1,
    x: 0,
    y: 0,
    joints,
    bones: stick.bones,
  };
}

/** Pose at `frame`: rest pose without keys; held before the first and after the last key. */
export function samplePose(stick: StickActor, frame: number): StickPose {
  const keys = stick.poses;
  if (!keys || keys.length === 0) return stick.joints;
  if (frame <= keys[0].frame) return keys[0].value;
  const last = keys[keys.length - 1];
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].frame <= frame) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = applyEasing(a.easing, (frame - a.frame) / (b.frame - a.frame));
  if (t <= 0) return a.value;
  if (t >= 1) return b.value;
  return interpolateStickPose(localFigure(stick, a.value), localFigure(stick, b.value), t).joints;
}

export const hasPoseKeys = (stick: StickActor) => (stick.poses?.length ?? 0) > 0;

/** Stopwatch rule for the pose: no keys → edit the rest pose; with keys → key at `frame`. */
export function setPose(stick: StickActor, frame: number, joints: StickPose, easing?: EasingName): StickActor {
  if (!hasPoseKeys(stick)) return { ...stick, joints };
  return { ...stick, poses: setKeyframe(stick.poses, frame, joints, easing) };
}

/** Adds a pose key with the pose seen at `frame`, or removes the key there. */
export function togglePoseKey(stick: StickActor, frame: number): StickActor {
  if (stick.poses?.some((k) => k.frame === frame)) {
    const poses = removeKeyframe(stick.poses, frame);
    // Removing the last key keeps the pose that was showing as the rest pose
    return poses.length === 0 ? { ...stick, poses, joints: samplePose(stick, frame) } : { ...stick, poses };
  }
  return { ...stick, poses: setKeyframe(stick.poses ?? [], frame, samplePose(stick, frame)) };
}

/** Pose stopwatch: on → a key with the current pose; off → no keys, the pose seen here becomes the rest pose. */
export function togglePoseTrack(stick: StickActor, frame: number): StickActor {
  if (hasPoseKeys(stick)) return { ...stick, poses: [], joints: samplePose(stick, frame) };
  return { ...stick, poses: setKeyframe([], frame, samplePose(stick, frame)) };
}

export function stickKeyframes(stick: StickActor): number[] {
  const frames = new Set(actorKeyframes(stick));
  stick.poses?.forEach((k) => frames.add(k.frame));
  return [...frames].sort((a, b) => a - b);
}

export function shiftStickTime(stick: StickActor, delta: number): StickActor {
  if (delta === 0) return stick;
  return { ...shiftActorTime(stick, delta), poses: (stick.poses ?? []).map((k) => ({ ...k, frame: k.frame + delta })) };
}

export function moveStickKeys(stick: StickActor, from: number, to: number): StickActor {
  return { ...moveActorKeys(stick, from, to), poses: moveKeyframe(stick.poses, from, to) };
}

/** The figure placed on the stage at `frame` (position and scale applied; rotation is not). */
export function worldFigure(stick: StickActor, frame: number): StickFigure {
  const state = sampleActor(stick, frame);
  return { ...localFigure(stick, samplePose(stick, frame)), x: state.x, y: state.y, scale: state.scale };
}

/** Local bounding box of the pose at `frame` (head radius included), for selection and hit tests. */
export function poseBox(stick: StickActor, frame: number) {
  const joints = Object.values(samplePose(stick, frame));
  if (joints.length === 0) return { x: -10, y: -10, width: 20, height: 20 };
  const pad = (j: Joint) => (j.radius ?? 0) + stick.thickness;
  const minX = Math.min(...joints.map((j) => j.x - pad(j)));
  const maxX = Math.max(...joints.map((j) => j.x + pad(j)));
  const minY = Math.min(...joints.map((j) => j.y - pad(j)));
  const maxY = Math.max(...joints.map((j) => j.y + pad(j)));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function createStickActor(figure: StickFigure, startFrame: number, durationFrames: number): StickActor {
  const motion = staticMotion(figure.x, figure.y);
  return {
    id: figure.id,
    name: figure.name,
    color: figure.color,
    thickness: figure.thickness,
    bones: figure.bones,
    joints: figure.joints,
    poses: [],
    startFrame,
    durationFrames,
    ...motion,
    base: { ...motion.base, scale: figure.scale },
  };
}

/**
 * Breaks the figure as drawn at `frame` into loose strokes (head circle + one line per bone), in
 * canvas space with the whole transform applied (Flash "Break apart").
 */
export function stickToStrokes(stick: StickActor, frame: number, idPrefix: string): DrawingStroke[] {
  const state = sampleActor(stick, frame);
  const pose = samplePose(stick, frame);
  const rad = (state.rotation * Math.PI) / 180;
  const toWorld = (x: number, y: number) => ({
    x: Math.round(state.x + (x * Math.cos(rad) - y * Math.sin(rad)) * state.scale),
    y: Math.round(state.y + (x * Math.sin(rad) + y * Math.cos(rad)) * state.scale),
  });
  const thickness = Math.max(1, Math.round(stick.thickness * state.scale));
  const strokes: DrawingStroke[] = [];
  const head = pose.head;
  if (head) {
    // Circle strokes are stored as two opposite corners of their box (as the circle tool draws them)
    const c = toWorld(head.x, head.y);
    const r = Math.round((head.radius ?? 20) * state.scale);
    const points = [
      { x: c.x - r, y: c.y - r },
      { x: c.x + r, y: c.y + r },
    ];
    strokes.push({ id: `${idPrefix}-head`, tool: 'circle', points, color: stick.color, thickness });
  }
  stick.bones.forEach((bone, i) => {
    const a = pose[bone.from];
    const b = pose[bone.to];
    if (!a || !b) return;
    strokes.push({
      id: `${idPrefix}-bone-${i}`,
      tool: 'line',
      points: [toWorld(a.x, a.y), toWorld(b.x, b.y)],
      color: stick.color,
      thickness,
    });
  });
  return strokes;
}

/** Timeline layer of a stick figure (layer type 'group' targets the figure). */
export const stickLayer = (stick: StickActor, name = stick.name): StudioLayer => ({
  id: `layer-stick-${stick.id}`,
  name,
  type: 'group',
  visible: true,
  locked: false,
  color: '#f59e0b',
  targetId: stick.id,
});

/** Adds a layer for each figure that has none (older projects drew figures on the drawings layer). */
export function withStickLayers(layers: StudioLayer[], sticks: StickActor[]): StudioLayer[] {
  const missing = sticks.filter((s) => !layers.some((l) => l.targetId === s.id));
  return missing.length === 0 ? layers : [...missing.map((s) => stickLayer(s)), ...layers];
}

// ================= MIGRATION (one copy per frame → pose track) =================

const samePose = (a: StickPose, b: StickPose) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([id, j]) => {
    const o = b[id];
    return o && Math.abs(o.x - j.x) < 0.01 && Math.abs(o.y - j.y) < 0.01 && (o.radius ?? 0) === (j.radius ?? 0);
  });

/**
 * Keeps only the frames needed to redraw a value series with linear interpolation within `tolerance`
 * (Ramer–Douglas–Peucker over time), so a figure walking across the stage becomes a few keys.
 */
export function simplifySeries(points: { frame: number; value: number[] }[], tolerance = 0.5): number[] {
  if (points.length <= 2) return points.map((p) => p.frame);
  const keep = new Set([0, points.length - 1]);
  const visit = (a: number, b: number) => {
    let worst = -1;
    let worstDist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const t = (points[i].frame - points[a].frame) / (points[b].frame - points[a].frame);
      const dist = Math.max(
        ...points[i].value.map((v, d) => Math.abs(v - (points[a].value[d] + (points[b].value[d] - points[a].value[d]) * t)))
      );
      if (dist > worstDist) {
        worst = i;
        worstDist = dist;
      }
    }
    if (worst !== -1) {
      keep.add(worst);
      visit(a, worst);
      visit(worst, b);
    }
  };
  visit(0, points.length - 1);
  return [...keep].sort((x, y) => x - y).map((i) => points[i].frame);
}

/**
 * Turns stick figures stored per frame into stick actors: pose keys where the pose was set by hand
 * (in-betweens made by the old tween become an eased segment, held poses a 'hold'), position/scale
 * keys only where the movement changes. The frames keep their drawings.
 */
export function migrateFrameSticks(frames: Record<number, FrameData>): {
  sticks: StickActor[];
  frames: Record<number, FrameData>;
} {
  const byId = new Map<string, { frame: number; fig: StickFigure }[]>();
  Object.values(frames)
    .sort((a, b) => a.frameNumber - b.frameNumber)
    .forEach((data) =>
      (data.stickFigures ?? []).forEach((fig) => {
        if (!byId.has(fig.id)) byId.set(fig.id, []);
        byId.get(fig.id)!.push({ frame: data.frameNumber, fig });
      })
    );

  const sticks: StickActor[] = [];
  byId.forEach((entries) => {
    const first = entries[0].fig;
    const start = entries[0].frame;
    const end = entries[entries.length - 1].frame;
    let stick = createStickActor(first, start, Math.max(1, end - start));

    // Pose keys: hand-made poses that differ from the previous frame
    const keyIdx = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => i === 0 || (!e.fig.tweened && !samePose(e.fig.joints, entries[i - 1].fig.joints)))
      .map(({ i }) => i);
    if (keyIdx.length > 1) {
      const poses: Track<StickPose> = keyIdx.map((idx, k) => {
        const next = keyIdx[k + 1] ?? entries.length;
        const between = entries.slice(idx + 1, next);
        const easing: EasingName = between.length > 0 && between.every((b) => b.fig.tweened) ? 'easeInOut' : 'hold';
        return { frame: entries[idx].frame, value: entries[idx].fig.joints, easing };
      });
      stick = { ...stick, poses };
    }

    // Position and scale: only the keys that shape the movement
    const series = entries.map((e) => ({ frame: e.frame, value: [e.fig.x, e.fig.y, e.fig.scale] }));
    const moves = series.some((p) => p.value.some((v, d) => Math.abs(v - series[0].value[d]) > 0.01));
    if (moves) {
      const keyFrames = new Set(simplifySeries(series));
      const kept = series.filter((p) => keyFrames.has(p.frame));
      const position = kept.map((p) => ({ frame: p.frame, value: { x: p.value[0], y: p.value[1] }, easing: 'linear' as EasingName }));
      const scales = kept.map((p) => ({ frame: p.frame, value: p.value[2], easing: 'linear' as EasingName }));
      const scaleChanges = scales.some((k) => Math.abs(k.value - scales[0].value) > 1e-6);
      stick = { ...stick, smoothPath: false, tracks: { position, ...(scaleChanges ? { scale: scales } : {}) } };
    }
    sticks.push(stick);
  });

  const cleaned: Record<number, FrameData> = {};
  Object.entries(frames).forEach(([k, data]) => (cleaned[Number(k)] = { ...data, stickFigures: [] }));
  return { sticks, frames: cleaned };
}
