/**
 * Per-object effects (shadow, glow, blur, tint): defaults, valid ranges and sampling. Pure; drawing
 * lives in `utils/exportVideo.ts`. Each effect has a trigger that is 0 when the effect is off.
 */
import type { Animated, EffectParams, EffectProp } from '../types';
import { sampleTrack } from './keyframes';

export type EffectGroup = 'shadow' | 'glow' | 'blur' | 'tint';

export const DEFAULT_EFFECTS: EffectParams = {
  shadowOpacity: 0, shadowBlur: 8, shadowX: 0, shadowY: 4, shadowColor: '#000000',
  glowRadius: 0, glowStrength: 1, glowColor: '#ffffff',
  blur: 0,
  tintAmount: 0, tintColor: '#ff0000',
};

export const EFFECT_PROPS: Record<EffectProp, { group: EffectGroup; min: number; max: number; step: number }> = {
  shadowOpacity: { group: 'shadow', min: 0, max: 1, step: 0.05 },
  shadowBlur: { group: 'shadow', min: 0, max: 100, step: 1 },
  shadowX: { group: 'shadow', min: -200, max: 200, step: 1 },
  shadowY: { group: 'shadow', min: -200, max: 200, step: 1 },
  glowRadius: { group: 'glow', min: 0, max: 100, step: 1 },
  glowStrength: { group: 'glow', min: 0, max: 1, step: 0.05 },
  blur: { group: 'blur', min: 0, max: 100, step: 1 },
  tintAmount: { group: 'tint', min: 0, max: 1, step: 0.05 },
};

/** UI groups in display order: the trigger and the value the quick on/off button turns it to. */
export const EFFECT_GROUPS: { id: EffectGroup; trigger: EffectProp; onValue: number }[] = [
  { id: 'shadow', trigger: 'shadowOpacity', onValue: 0.6 },
  { id: 'glow', trigger: 'glowRadius', onValue: 12 },
  { id: 'blur', trigger: 'blur', onValue: 6 },
  { id: 'tint', trigger: 'tintAmount', onValue: 0.5 },
];

export function isEffectProp(prop: string): prop is EffectProp {
  return Object.hasOwn(EFFECT_PROPS, prop);
}

const clampProp = (prop: EffectProp, v: number) => {
  const { min, max } = EFFECT_PROPS[prop];
  return Math.min(max, Math.max(min, v));
};

/** Effect values at `frame` (keys win over the static value), clamped to their valid ranges. */
export function sampleEffects(obj: Animated, frame: number): EffectParams {
  const stat = obj.effects ?? DEFAULT_EFFECTS;
  const out = { ...DEFAULT_EFFECTS };
  (Object.keys(EFFECT_PROPS) as EffectProp[]).forEach((prop) => {
    const fallback = typeof stat[prop] === 'number' && Number.isFinite(stat[prop]) ? stat[prop] : DEFAULT_EFFECTS[prop];
    const v = sampleTrack(obj.tracks[prop], frame, fallback);
    out[prop] = clampProp(prop, Number.isFinite(v) ? v : DEFAULT_EFFECTS[prop]);
  });
  (['shadowColor', 'glowColor', 'tintColor'] as const).forEach((key) => {
    out[key] = typeof stat[key] === 'string' ? stat[key] : DEFAULT_EFFECTS[key];
  });
  return out;
}

/** True when at least one effect would change the pixels (decides the renderer's fast path). */
export function hasActiveEffects(fx: EffectParams): boolean {
  return fx.shadowOpacity > 0 || (fx.glowRadius > 0 && fx.glowStrength > 0) || fx.blur > 0 || fx.tintAmount > 0;
}
