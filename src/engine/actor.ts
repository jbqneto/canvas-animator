import type { ActorOverlay, ActorTransform } from '../types';
import { samplePosition, sampleTrack, setKeyframe, hasKeyframeAt, moveKeyframe, Track, Vec2 } from './keyframes';

export type ActorProperty = keyof ActorOverlay['tracks'];

export interface ActorState extends ActorTransform {
  /** Inside the actor's [startFrame, startFrame + durationFrames] span. */
  visible: boolean;
}

export function isActorOnScreen(actor: ActorOverlay, frame: number): boolean {
  return frame >= actor.startFrame && frame <= actor.startFrame + actor.durationFrames;
}

/** Evaluates every animated property of the actor at `frame`. */
export function sampleActor(actor: ActorOverlay, frame: number): ActorState {
  const { base, tracks } = actor;
  const pos = samplePosition(tracks.position, frame, base, actor.smoothPath);
  const pathAngle = actor.orientToPath && (tracks.position?.length ?? 0) >= 2 ? pos.angle : 0;
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

export function isAnimated(actor: ActorOverlay, prop: ActorProperty): boolean {
  return (actor.tracks[prop]?.length ?? 0) > 0;
}

/**
 * Edits a property at `frame` following the After Effects stopwatch rule:
 * not animated → change the static base value; animated → create/update the key at `frame`.
 */
export function setActorProperty<P extends ActorProperty>(
  actor: ActorOverlay,
  prop: P,
  frame: number,
  value: PropertyValue<P>
): ActorOverlay {
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
  actor: ActorOverlay,
  prop: P,
  frame: number
): PropertyValue<P> {
  if (prop === 'position') {
    const p = samplePosition(actor.tracks.position, frame, actor.base, actor.smoothPath);
    return { x: p.x, y: p.y } as PropertyValue<P>;
  }
  const track = actor.tracks[prop as Exclude<ActorProperty, 'position'>];
  return sampleTrack(track, frame, actor.base[prop as 'scale']) as PropertyValue<P>;
}

/**
 * Stopwatch toggle: turning animation on creates the first key with the current value at `frame`;
 * turning it off removes all keys and keeps the value seen at `frame` as the static value.
 */
export function toggleAnimated(actor: ActorOverlay, prop: ActorProperty, frame: number): ActorOverlay {
  const current = actorPropertyValue(actor, prop, frame);
  if (isAnimated(actor, prop)) {
    const cleared = { ...actor, tracks: { ...actor.tracks, [prop]: [] } };
    return setActorProperty(cleared, prop, frame, current as any);
  }
  const track = setKeyframe<any>([], frame, current);
  return { ...actor, tracks: { ...actor.tracks, [prop]: track } };
}

/** Every frame that has a key on any property, sorted, for the timeline diamonds. */
export function actorKeyframes(actor: ActorOverlay): number[] {
  const frames = new Set<number>();
  (Object.values(actor.tracks) as Track<unknown>[]).forEach((track) => track?.forEach((k) => frames.add(k.frame)));
  return [...frames].sort((a, b) => a - b);
}

export function actorHasKeyAt(actor: ActorOverlay, frame: number): boolean {
  return (Object.values(actor.tracks) as Track<unknown>[]).some((track) => hasKeyframeAt(track, frame));
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

export function hitTestActor(actor: ActorOverlay, frame: number, point: Vec2, padding = 4): boolean {
  const state = sampleActor(actor, frame);
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
export function shiftActorTime(actor: ActorOverlay, delta: number): ActorOverlay {
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
  };
}

/** Retimes every property key at `from` to `to` (dragging a diamond on the timeline). */
export function moveActorKeys(actor: ActorOverlay, from: number, to: number): ActorOverlay {
  if (from === to) return actor;
  const tracks = { ...actor.tracks };
  (Object.keys(tracks) as ActorProperty[]).forEach((prop) => {
    (tracks as Record<ActorProperty, Track<unknown> | undefined>)[prop] = moveKeyframe(
      tracks[prop] as Track<unknown> | undefined,
      from,
      to
    );
  });
  return { ...actor, tracks };
}
