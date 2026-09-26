/**
 * Stick figure rig: forward kinematics and pose interpolation (pure functions).
 *
 * The bones describe a tree (bone.from = parent joint, bone.to = child joint). The head has no bone
 * in the default figure, so it is attached to the neck. Joint coordinates are local to the figure.
 */
import type { Joint, StickFigure } from '../types';
import { applyEasing, EasingName } from './keyframes';

type Parents = Record<string, string | undefined>;

export function jointParents(stick: StickFigure): Parents {
  const parents: Parents = {};
  stick.bones.forEach((b) => {
    if (stick.joints[b.from] && stick.joints[b.to]) parents[b.to] = b.from;
  });
  if (stick.joints.head && !parents.head && stick.joints.neck) parents.head = 'neck';
  return parents;
}

/** Joint ids ordered parents-first (roots first), so poses can be rebuilt top-down. */
function topologicalOrder(stick: StickFigure, parents: Parents): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string, guard = 0) => {
    if (visited.has(id) || guard > 64) return;
    const parent = parents[id];
    if (parent) visit(parent, guard + 1);
    visited.add(id);
    order.push(id);
  };
  Object.keys(stick.joints).forEach((id) => visit(id));
  return order;
}

export function descendantsOf(stick: StickFigure, jointId: string): string[] {
  const parents = jointParents(stick);
  const out: string[] = [];
  const walk = (id: string) => {
    Object.keys(parents).forEach((child) => {
      if (parents[child] === id && !out.includes(child)) {
        out.push(child);
        walk(child);
      }
    });
  };
  walk(jointId);
  return out;
}

const rotateAround = (p: { x: number; y: number }, c: { x: number; y: number }, angle: number) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};

/**
 * Forward kinematics drag (Pivot Animator / Flash bone behaviour): the joint rotates around its parent
 * towards `target` (local coordinates), keeping the bone length, and its whole sub-chain follows.
 * A joint without parent (the root) just moves with its sub-chain.
 */
export function dragJointFK(stick: StickFigure, jointId: string, target: { x: number; y: number }): StickFigure {
  const joint = stick.joints[jointId];
  if (!joint) return stick;
  const parentId = jointParents(stick)[jointId];
  const chain = [jointId, ...descendantsOf(stick, jointId)];
  const joints: Record<string, Joint> = { ...stick.joints };

  if (!parentId) {
    const dx = target.x - joint.x;
    const dy = target.y - joint.y;
    chain.forEach((id) => (joints[id] = { ...joints[id], x: joints[id].x + dx, y: joints[id].y + dy }));
    return { ...stick, joints };
  }

  const pivot = stick.joints[parentId];
  const current = Math.atan2(joint.y - pivot.y, joint.x - pivot.x);
  const wanted = Math.atan2(target.y - pivot.y, target.x - pivot.x);
  const delta = wanted - current;
  chain.forEach((id) => {
    const p = rotateAround(joints[id], pivot, delta);
    joints[id] = { ...joints[id], x: p.x, y: p.y };
  });
  return { ...stick, joints };
}

/** Shortest signed angular difference b - a, in radians (-π..π]. */
function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Interpolates two poses of the same figure. Each bone's angle (relative to the figure) turns along the
 * shortest arc and its length is interpolated, so limbs never shrink mid-motion the way a straight
 * position lerp would make them. Roots, figure position, scale and head radius are lerped.
 */
export function interpolateStickPose(a: StickFigure, b: StickFigure, t: number): StickFigure {
  const parents = jointParents(a);
  const order = topologicalOrder(a, parents);
  const joints: Record<string, Joint> = {};

  order.forEach((id) => {
    const ja = a.joints[id];
    const jb = b.joints[id] ?? ja;
    const parentId = parents[id];
    const radius = ja.radius !== undefined ? lerp(ja.radius, jb.radius ?? ja.radius, t) : undefined;
    if (!parentId || !joints[parentId]) {
      joints[id] = { ...ja, x: lerp(ja.x, jb.x, t), y: lerp(ja.y, jb.y, t), ...(radius !== undefined ? { radius } : {}) };
      return;
    }
    const pa = a.joints[parentId];
    const pb = b.joints[parentId] ?? pa;
    const angA = Math.atan2(ja.y - pa.y, ja.x - pa.x);
    const angB = Math.atan2(jb.y - pb.y, jb.x - pb.x);
    const len = lerp(Math.hypot(ja.x - pa.x, ja.y - pa.y), Math.hypot(jb.x - pb.x, jb.y - pb.y), t);
    const ang = angA + angleDelta(angA, angB) * t;
    const parent = joints[parentId];
    joints[id] = {
      ...ja,
      x: parent.x + Math.cos(ang) * len,
      y: parent.y + Math.sin(ang) * len,
      ...(radius !== undefined ? { radius } : {}),
    };
  });

  return {
    ...a,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scale: lerp(a.scale, b.scale, t),
    thickness: lerp(a.thickness, b.thickness, t),
    joints,
  };
}

/**
 * Builds the in-between poses for frames strictly between `fromFrame` and `toFrame` (Flash classic tween).
 * Returns a map frame → pose; the caller writes them into the frames.
 */
export function tweenStickFrames(
  from: StickFigure,
  to: StickFigure,
  fromFrame: number,
  toFrame: number,
  easing: EasingName
): Record<number, StickFigure> {
  const out: Record<number, StickFigure> = {};
  const span = toFrame - fromFrame;
  for (let f = fromFrame + 1; f < toFrame; f++) {
    const t = applyEasing(easing, (f - fromFrame) / span);
    out[f] = { ...interpolateStickPose(from, to, t), tweened: true };
  }
  return out;
}
