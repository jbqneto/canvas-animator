/**
 * Loop and shake for transform properties (After Effects' loopOut and wiggle). Pure and deterministic:
 * the same frame always gives the same value, so preview, scrubbing and export agree.
 */
import type { ModifiableProperty, PropertyModifier } from '../types';
import type { Track } from './keyframes';

export const MODIFIABLE_PROPERTIES: ModifiableProperty[] = ['position', 'scale', 'rotation', 'opacity'];

/** Largest shake per property, in the unit of that property (see `PropertyModifier`). */
export const SHAKE_LIMITS: Record<ModifiableProperty, { max: number; step: number }> = {
  position: { max: 200, step: 1 },
  scale: { max: 1, step: 0.01 },
  rotation: { max: 90, step: 1 },
  opacity: { max: 1, step: 0.05 },
};

export const SHAKE_PERIOD = { min: 1, max: 240, default: 4 };

/**
 * The frame to read the keys at: past the last key a looping property goes back to the first key
 * (`cycle`) or walks back and forth (`pingpong`). Before the first key, or with fewer than two keys
 * or one frame of span, nothing changes.
 */
export function loopFrame(track: Track<unknown> | undefined, frame: number, mode: PropertyModifier['loop']): number {
  if ((mode !== 'cycle' && mode !== 'pingpong') || !track || track.length < 2) return frame;
  const first = track[0].frame;
  const last = track[track.length - 1].frame;
  const span = last - first;
  if (span <= 0 || frame <= last) return frame;
  const over = frame - first;
  if (mode === 'cycle') return first + (over % span);
  const phase = over % (2 * span);
  return first + (phase <= span ? phase : 2 * span - phase);
}

/** FNV-1a: a stable 32-bit hash of a string. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A repeatable random value in [-1, 1] for one lattice point. */
const knot = (seed: string, index: number) => (hash(`${seed}:${index}`) / 4294967295) * 2 - 1;

/**
 * Smooth noise in [-amount, amount]: a random target every `periodFrames` frames, eased in between.
 * `seed` separates objects, properties and axes so they do not shake in unison.
 */
export function shakeOffset(seed: string, frame: number, amount: number, periodFrames: number): number {
  if (typeof amount !== 'number' || !(amount > 0)) return 0;
  const period = Math.max(SHAKE_PERIOD.min, Number.isFinite(periodFrames) ? periodFrames : SHAKE_PERIOD.default);
  const at = frame / period;
  const i = Math.floor(at);
  const f = at - i;
  const eased = f * f * (3 - 2 * f);
  return amount * (knot(seed, i) * (1 - eased) + knot(seed, i + 1) * eased);
}

/** A modifier with usable numbers (amount inside its limit, period an integer in range), or undefined when empty. */
export function cleanModifier(prop: ModifiableProperty, mod: PropertyModifier | undefined): PropertyModifier | undefined {
  if (!mod) return undefined;
  const loop = mod.loop === 'cycle' || mod.loop === 'pingpong' ? mod.loop : undefined;
  const raw = mod.shake;
  const amount = raw && Number.isFinite(raw.amount) ? Math.min(SHAKE_LIMITS[prop].max, Math.max(0, raw.amount)) : 0;
  const period = raw && Number.isFinite(raw.periodFrames) ? Math.round(raw.periodFrames) : SHAKE_PERIOD.default;
  const shake = amount > 0 ? { amount, periodFrames: Math.min(SHAKE_PERIOD.max, Math.max(SHAKE_PERIOD.min, period)) } : undefined;
  return loop || shake ? { ...(loop ? { loop } : {}), ...(shake ? { shake } : {}) } : undefined;
}
