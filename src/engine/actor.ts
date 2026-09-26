/**
 * Keyframed transform of any animated object (actor, chart, text): stopwatch rule, sampling, keys,
 * retiming and "follow path". Functions are generic over `Animated`, so they keep the concrete type.
 */
import type { ActorOverlay, ActorTransform, Animated, MotionPath } from '../types';
import { buildFollowProgress, pointAtProgress, polylineUpTo, samplePath } from './path';
import { samplePosition, sampleTrack, setKeyframe, hasKeyframeAt, moveKeyframe, Track, Vec2 } from './keyframes';

export type ActorProperty = keyof Animated['tracks'];

export interface ActorState extends ActorTransform {
  /** Inside the actor's [startFrame, startFrame + durationFrames] span. */
  visible: boolean;
}

export function isActorOnScreen(actor: Animated, frame: number): boolean {
  return frame >= actor.startFrame && frame <= actor.startFrame + actor.durationFrames;
}

/** The path the actor is following, if the link is valid. */
export function followedPath(actor: Animated, paths: MotionPath[]): MotionPath | undefined {
  if (!actor.follow) return undefined;
  const path = paths.find((p) => p.id === actor.follow!.pathId);
  return path && path.points.length >= 2 ? path : undefined;
}

/** Position (and travel direction) from the followed path, or from the position keys. */
function samplePlacement(actor: Animated, frame: number, paths: MotionPath[]) {
  const path = followedPath(actor, paths);
  if (path && actor.follow) {
    const p = pointAtProgress(samplePath(path), sampleTrack(actor.follow.progress, frame, 0));
    return { x: p.x, y: p.y, angle: actor.follow.orient ? p.angle : 0 };
  }
  const pos = samplePosition(actor.tracks.position, frame, actor.base, actor.smoothPath);
  const animated = (actor.tracks.position?.length ?? 0) >= 2;
  return { x: pos.x, y: pos.y, angle: actor.orientToPath && animated ? pos.angle : 0 };
}

/** Evaluates every animated property of the actor at `frame` (`paths` resolves "follow path"). */
export function sampleActor(actor: Animated, frame: number, paths: MotionPath[] = []): ActorState {
  const { base, tracks } = actor;
  const pos = samplePlacement(actor, frame, paths);
  const pathAngle = pos.angle;
  return {
    x: pos.x,
    y: pos.y,
    scale: sampleTrack(tracks.scale, frame, base.scale),
    rotation: sampleTrack(tracks.rotation, frame, base.rotation) + pathAngle,
    opacity: Math.max(0, Math.min(1, sampleTrack(tracks.opacity, frame, base.opacity))),
    visible: isActorOnScreen(actor, frame),
  };
}

type PropertyValue<P extends ActorProperty> = P extends 'position' ? Vec2 : number;

export function isAnimated(actor: Animated, prop: ActorProperty): boolean {
  return (actor.tracks[prop]?.length ?? 0) > 0;
}

/**
 * Edits a property at `frame` following the After Effects stopwatch rule:
 * not animated → change the static base value; animated → create/update the key at `frame`.
 */
export function setActorProperty<T extends Animated, P extends ActorProperty>(
  actor: T,
  prop: P,
  frame: number,
  value: PropertyValue<P>
): T {
  if (!isAnimated(actor, prop)) {
    const base =
      prop === 'position'
        ? { ...actor.base, ...(value as Vec2) }
        : { ...actor.base, [prop]: value as number };
    return { ...actor, base };
  }
  const track = setKeyframe(actor.tracks[prop] as any, frame, value as any);
  return { ...actor, tracks: { ...actor.tracks, [prop]: track } };
}

/** Current (unrotated-by-path) value of a property, as the user edits it. */
export function actorPropertyValue<P extends ActorProperty>(
  actor: Animated,
  prop: P,
  frame: number,
  paths: MotionPath[] = []
): PropertyValue<P> {
  if (prop === 'position') {
    const p = samplePlacement(actor, frame, paths);
    return { x: p.x, y: p.y } as PropertyValue<P>;
  }
  const track = actor.tracks[prop as Exclude<ActorProperty, 'position'>];
  return sampleTrack(track, frame, actor.base[prop as 'scale']) as PropertyValue<P>;
}

/**
 * Stopwatch toggle: turning animation on creates the first key with the current value at `frame`;
 * turning it off removes all keys and keeps the value seen at `frame` as the static value.
 */
export function toggleAnimated<T extends Animated>(actor: T, prop: ActorProperty, frame: number): T {
  const current = actorPropertyValue(actor, prop, frame);
  if (isAnimated(actor, prop)) {
    const cleared = { ...actor, tracks: { ...actor.tracks, [prop]: [] } };
    return setActorProperty(cleared, prop, frame, current as any);
  }
  const track = setKeyframe<any>([], frame, current);
  return { ...actor, tracks: { ...actor.tracks, [prop]: track } };
}

/** All keyframe tracks of the actor, including the path progress when following a path. */
function allTracks(actor: Animated): (Track<unknown> | undefined)[] {
  return [...(Object.values(actor.tracks) as Track<unknown>[]), actor.follow?.progress];
}

/** Every frame that has a key on any property, sorted, for the timeline diamonds. */
export function actorKeyframes(actor: Animated): number[] {
  const frames = new Set<number>();
  allTracks(actor).forEach((track) => track?.forEach((k) => frames.add(k.frame)));
  return [...frames].sort((a, b) => a - b);
}

export function actorHasKeyAt(actor: Animated, frame: number): boolean {
  return allTracks(actor).some((track) => hasKeyframeAt(track, frame));
}

/** Converts a canvas point into the actor's local, unscaled/unrotated space (origin = anchor). */
export function toActorLocal(state: ActorTransform, point: Vec2): Vec2 {
  const dx = point.x - state.x;
  const dy = point.y - state.y;
  const rad = (-state.rotation * Math.PI) / 180;
  const s = state.scale || 1e-6;
  return {
    x: (dx * Math.cos(rad) - dy * Math.sin(rad)) / s,
    y: (dx * Math.sin(rad) + dy * Math.cos(rad)) / s,
  };
}

export function hitTestActor(
  actor: ActorOverlay,
  frame: number,
  point: Vec2,
  paths: MotionPath[] = [],
  padding = 4
): boolean {
  const state = sampleActor(actor, frame, paths);
  if (!state.visible) return false;
  const local = toActorLocal(state, point);
  return Math.abs(local.x) <= actor.width / 2 + padding && Math.abs(local.y) <= actor.height / 2 + padding;
}

export function createActor(params: {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  x: number;
  y: number;
  startFrame: number;
  durationFrames: number;
}): ActorOverlay {
  return {
    id: params.id,
    name: params.name,
    kind: 'image',
    src: params.src,
    width: params.width,
    height: params.height,
    startFrame: params.startFrame,
    durationFrames: params.durationFrames,
    base: { x: params.x, y: params.y, scale: 1, rotation: 0, opacity: 1 },
    tracks: {},
    smoothPath: true,
    orientToPath: false,
    flipX: false,
  };
}

/** Moves the actor in time together with all its keys (like sliding a layer in After Effects). */
export function shiftActorTime<T extends Animated>(actor: T, delta: number): T {
  if (delta === 0) return actor;
  const shift = <T,>(track?: Track<T>) => track?.map((k) => ({ ...k, frame: k.frame + delta }));
  return {
    ...actor,
    startFrame: actor.startFrame + delta,
    tracks: {
      position: shift(actor.tracks.position),
      scale: shift(actor.tracks.scale),
      rotation: shift(actor.tracks.rotation),
      opacity: shift(actor.tracks.opacity),
    },
    follow: actor.follow && { ...actor.follow, progress: shift(actor.follow.progress) ?? [] },
  };
}

/** Retimes every property key at `from` to `to` (dragging a diamond on the timeline). */
export function moveActorKeys<T extends Animated>(actor: T, from: number, to: number): T {
  if (from === to) return actor;
  const tracks = { ...actor.tracks };
  (Object.keys(tracks) as ActorProperty[]).forEach((prop) => {
    (tracks as Record<ActorProperty, Track<unknown> | undefined>)[prop] = moveKeyframe(
      tracks[prop] as Track<unknown> | undefined,
      from,
      to
    );
  });
  const follow = actor.follow && { ...actor.follow, progress: moveKeyframe(actor.follow.progress, from, to) };
  return { ...actor, tracks, follow };
}

/**
 * Points of the path already travelled at `frame` (one per frame from the first position key),
 * ending exactly at the current position. Empty when the actor isn't moving along keys.
 */
export function trailPoints(actor: Animated, frame: number, paths: MotionPath[] = []): Vec2[] {
  const path = followedPath(actor, paths);
  if (path && actor.follow) {
    return polylineUpTo(samplePath(path), sampleTrack(actor.follow.progress, frame, 0));
  }
  const track = actor.tracks.position;
  if (!track || track.length < 2) return [];
  const first = track[0].frame;
  const end = Math.min(frame, track[track.length - 1].frame);
  if (end <= first) return [];
  const points: Vec2[] = [];
  for (let f = first; f < end; f++) {
    const p = samplePosition(track, f, actor.base, actor.smoothPath);
    points.push({ x: p.x, y: p.y });
  }
  const last = samplePosition(track, frame, actor.base, actor.smoothPath);
  points.push({ x: last.x, y: last.y });
  return points;
}

/** Local box of an object around its anchor (unscaled, unrotated), for hit tests and selection. */
export interface LocalBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True when `point` (canvas space) falls inside `box` of the object as drawn at `frame`. */
export function hitTestBox(
  obj: Animated,
  box: LocalBox,
  frame: number,
  point: Vec2,
  paths: MotionPath[] = [],
  padding = 4
): boolean {
  const state = sampleActor(obj, frame, paths);
  if (!state.visible) return false;
  const local = toActorLocal(state, point);
  return (
    local.x >= box.x - padding &&
    local.x <= box.x + box.width + padding &&
    local.y >= box.y - padding &&
    local.y <= box.y + box.height + padding
  );
}

/**
 * Links an object to a drawn path: it travels the whole path, eased, during the part of the timeline
 * where both are visible (or its own span when they barely overlap). Timing stays editable as keys.
 */
export function attachToPath<T extends Animated>(obj: T, path: MotionPath): T {
  let start = Math.max(obj.startFrame, path.startFrame);
  let end = Math.min(obj.startFrame + obj.durationFrames, path.startFrame + path.durationFrames);
  if (end - start < 2) {
    start = obj.startFrame;
    end = obj.startFrame + obj.durationFrames;
  }
  const progress = buildFollowProgress({
    anchorProgress: samplePath(path).anchorProgress,
    startFrame: start,
    endFrame: end,
    easing: 'easeInOut',
    holdFrames: 0,
  });
  return { ...obj, follow: { pathId: path.id, orient: true, progress } };
}

/** Static transform at a point, with no keys: what a newly created object starts with. */
export function staticMotion(x: number, y: number): Pick<Animated, 'base' | 'tracks' | 'smoothPath' | 'orientToPath'> {
  return { base: { x, y, scale: 1, rotation: 0, opacity: 1 }, tracks: {}, smoothPath: true, orientToPath: false };
}
