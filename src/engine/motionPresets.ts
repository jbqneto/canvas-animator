/**
 * Ready-made entrances and exits (fade, slide, pop) for any animated object. They only write
 * ordinary keyframes at the start/end of the object's span, so the result stays editable like any
 * hand-made animation (and can be applied on top of existing keys).
 */
import type { Animated } from '../types';
import { actorPropertyValue } from './actor';
import { EasingName, setKeyframe, Track, Vec2 } from './keyframes';

export type MotionPreset = 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'pop';

/** In the order offered in the UI (labels: `motionPreset.<name>`). */
export const MOTION_PRESETS: MotionPreset[] = ['fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'pop'];

export interface PresetOptions {
  /** Length of the entrance/exit in frames. */
  frames: number;
  /** How far a slide travels, in canvas pixels. */
  distance?: number;
}

/** Direction a slide comes from (entrance) or goes to (exit). */
const SLIDE_OFFSET: Partial<Record<MotionPreset, Vec2>> = {
  slideUp: { x: 0, y: 1 }, // enters moving up = starts below
  slideDown: { x: 0, y: -1 },
  slideLeft: { x: 1, y: 0 }, // enters moving left = starts on the right
  slideRight: { x: -1, y: 0 },
};

function withKeys<T extends Animated>(
  obj: T,
  prop: 'position' | 'scale' | 'opacity',
  keys: { frame: number; value: any; easing?: EasingName }[]
): T {
  let track = obj.tracks[prop] as Track<any> | undefined;
  keys.forEach((k) => {
    track = setKeyframe(track, k.frame, k.value, k.easing ?? 'linear');
  });
  return { ...obj, tracks: { ...obj.tracks, [prop]: track } };
}

/** Frames of the entrance or exit window, kept inside the object's span. */
function presetWindow(obj: Animated, which: 'in' | 'out', frames: number): [number, number] {
  const start = obj.startFrame;
  const end = obj.startFrame + obj.durationFrames;
  const length = Math.max(1, Math.min(Math.round(frames), Math.floor(obj.durationFrames / 2) || 1));
  return which === 'in' ? [start, start + length] : [end - length, end];
}

function apply<T extends Animated>(obj: T, preset: MotionPreset, which: 'in' | 'out', opts: PresetOptions): T {
  const [a, b] = presetWindow(obj, which, opts.frames);
  // The object's own (resting) values at the inner edge of the window
  const rest = which === 'in' ? b : a;
  const outer = which === 'in' ? a : b;
  const easing: EasingName = which === 'in' ? 'easeOut' : 'easeIn';
  const keyPair = (restValue: unknown, outerValue: unknown, ease: EasingName = easing) =>
    which === 'in'
      ? [
          { frame: outer, value: outerValue, easing: ease },
          { frame: rest, value: restValue },
        ]
      : [
          { frame: rest, value: restValue, easing: ease },
          { frame: outer, value: outerValue },
        ];

  let result = obj;
  if (preset === 'pop') {
    const scale = actorPropertyValue(obj, 'scale', rest);
    return withKeys(result, 'scale', keyPair(scale, 0, which === 'in' ? 'backOut' : 'easeIn'));
  }
  // Every other preset fades; slides also move
  const opacity = actorPropertyValue(obj, 'opacity', rest);
  result = withKeys(result, 'opacity', keyPair(opacity, 0));
  const dir = SLIDE_OFFSET[preset];
  if (dir && !obj.follow) {
    const distance = opts.distance ?? 120;
    const pos = actorPropertyValue(obj, 'position', rest);
    const away = which === 'in' ? dir : { x: -dir.x, y: -dir.y };
    const outside = { x: Math.round(pos.x + away.x * distance), y: Math.round(pos.y + away.y * distance) };
    result = withKeys(result, 'position', keyPair({ x: pos.x, y: pos.y }, outside));
  }
  return result;
}

/** Entrance at the start of the object's span (it arrives at its resting place/values). */
export function applyEntrance<T extends Animated>(obj: T, preset: MotionPreset, opts: PresetOptions): T {
  return apply(obj, preset, 'in', opts);
}

/** Exit at the end of the object's span (it leaves from its resting place/values). */
export function applyExit<T extends Animated>(obj: T, preset: MotionPreset, opts: PresetOptions): T {
  return apply(obj, preset, 'out', opts);
}
