/**
 * Ready-made entrances and exits (fade, slide, pop) for any animated object. They only write
 * ordinary keyframes at the start/end of the object's span, so the result stays editable like any
 * hand-made animation (and can be applied on top of existing keys).
 */
import type { Animated } from '../types';
import { actorPropertyValue } from './actor';
import { EasingName, setKeyframe, Track, Vec2 } from './keyframes';

export type MotionPreset = 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'pop' | 'blurIn' | 'blurSwap';

/** In the order offered in the UI (labels: `motionPreset.<name>`). */
export const MOTION_PRESETS: MotionPreset[] = ['fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'pop', 'blurIn', 'blurSwap'];

export interface PresetOptions {
  /** Length of the entrance/exit in frames. */
  frames: number;
  /** How far a slide travels, in canvas pixels. */
  distance?: number;
  /** Timeline frame rate, used by presets whose timing is defined in seconds. */
  fps?: number;
}

/** How out of focus the blur-in preset starts, in output pixels. */
const BLUR_IN_PX = 12;
const BLUR_SWAP_WAIT_SECONDS = 0.07;
const BLUR_SWAP_IN_SECONDS = 0.26;
const BLUR_SWAP_OUT_SECONDS = 0.12;

/** Direction a slide comes from (entrance) or goes to (exit). */
const SLIDE_OFFSET: Partial<Record<MotionPreset, Vec2>> = {
  slideUp: { x: 0, y: 1 }, // enters moving up = starts below
  slideDown: { x: 0, y: -1 },
  slideLeft: { x: 1, y: 0 }, // enters moving left = starts on the right
  slideRight: { x: -1, y: 0 },
};

function withKeys<T extends Animated>(
  obj: T,
  prop: 'position' | 'scale' | 'opacity' | 'blur',
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

/** Fixed blurSwap windows, clamped to the object span so a short clip remains editable. */
function blurSwapWindow(obj: Animated, which: 'in' | 'out', fps: number): [number, number, number?] {
  const start = obj.startFrame;
  const end = obj.startFrame + obj.durationFrames;
  const rate = Number.isFinite(fps) && fps > 0 ? fps : 30;
  if (which === 'out') {
    const length = Math.max(1, Math.min(Math.round(BLUR_SWAP_OUT_SECONDS * rate), Math.floor(obj.durationFrames)));
    return [end - length, end];
  }
  const wait = Math.min(Math.round(BLUR_SWAP_WAIT_SECONDS * rate), Math.max(0, Math.floor(obj.durationFrames) - 1));
  const length = Math.max(1, Math.min(Math.round(BLUR_SWAP_IN_SECONDS * rate), Math.floor(obj.durationFrames) - wait));
  return [start, start + wait, start + wait + length];
}

function apply<T extends Animated>(obj: T, preset: MotionPreset, which: 'in' | 'out', opts: PresetOptions): T {
  if (preset === 'blurSwap') {
    const fps = opts.fps ?? 30;
    if (which === 'in') {
      const [start, afterWait, rest] = blurSwapWindow(obj, 'in', fps) as [number, number, number];
      let result = withKeys(obj, 'opacity', [
        { frame: start, value: 0, easing: 'hold' },
        { frame: afterWait, value: 0, easing: 'easeOut' },
        { frame: rest, value: 1 },
      ]);
      result = withKeys(result, 'scale', [
        { frame: start, value: 0.94, easing: 'hold' },
        { frame: afterWait, value: 0.94, easing: 'easeOut' },
        { frame: rest, value: 1 },
      ]);
      return withKeys(result, 'blur', [
        { frame: start, value: BLUR_IN_PX, easing: 'hold' },
        { frame: afterWait, value: BLUR_IN_PX, easing: 'easeOut' },
        { frame: rest, value: 0 },
      ]);
    }
    const [rest, end] = blurSwapWindow(obj, 'out', fps) as [number, number];
    let result = withKeys(obj, 'opacity', [{ frame: rest, value: 1, easing: 'easeIn' }, { frame: end, value: 0 }]);
    result = withKeys(result, 'scale', [{ frame: rest, value: 1, easing: 'easeIn' }, { frame: end, value: 0.97 }]);
    return withKeys(result, 'blur', [{ frame: rest, value: 0, easing: 'easeIn' }, { frame: end, value: 9.6 }]);
  }
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
  // Blur-in: starts out of focus and sharpens to its resting blur (and the reverse on exit)
  if (preset === 'blurIn') {
    result = withKeys(result, 'blur', keyPair(actorPropertyValue(obj, 'blur', rest), BLUR_IN_PX));
  }
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
