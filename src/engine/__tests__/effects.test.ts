import { describe, expect, it } from 'vitest';
import { DEFAULT_EFFECTS, hasActiveEffects, isEffectProp, sampleEffects } from '../effects';
import { staticMotion } from '../actor';
import type { Animated } from '../../types';

const obj = (over: Partial<Animated> = {}): Animated => ({
  startFrame: 1, durationFrames: 100, ...staticMotion(0, 0), ...over,
});

describe('effects engine', () => {
  it('defaults to everything off', () => {
    const fx = sampleEffects(obj(), 10);
    expect(fx).toEqual(DEFAULT_EFFECTS);
    expect(hasActiveEffects(fx)).toBe(false);
  });

  it('uses the static effects value when there are no keys', () => {
    const fx = sampleEffects(obj({ effects: { ...DEFAULT_EFFECTS, blur: 7, tintColor: '#00ff00' } }), 10);
    expect(fx.blur).toBe(7);
    expect(fx.tintColor).toBe('#00ff00');
  });

  it('interpolates a keyed parameter between keys', () => {
    const o = obj({
      tracks: { blur: [{ frame: 1, value: 12, easing: 'linear' }, { frame: 11, value: 0 }] },
    });
    expect(sampleEffects(o, 6).blur).toBeCloseTo(6);
    expect(sampleEffects(o, 11).blur).toBe(0);
  });

  it('clamps out-of-range values', () => {
    const fx = sampleEffects(
      obj({ effects: { ...DEFAULT_EFFECTS, shadowOpacity: 4, blur: -3, glowRadius: 9999 } }), 1);
    expect(fx.shadowOpacity).toBe(1);
    expect(fx.blur).toBe(0);
    expect(fx.glowRadius).toBe(100);
  });

  it('treats NaN and non-numbers from hand-edited files as the default', () => {
    const fx = sampleEffects(
      obj({ effects: { ...DEFAULT_EFFECTS, blur: NaN, shadowBlur: 'x' as unknown as number } }), 1);
    expect(fx.blur).toBe(0);
    expect(fx.shadowBlur).toBe(DEFAULT_EFFECTS.shadowBlur);
  });

  it('falls back to default colors when the color is not a string', () => {
    const fx = sampleEffects(obj({ effects: { ...DEFAULT_EFFECTS, glowColor: 5 as unknown as string } }), 1);
    expect(fx.glowColor).toBe('#ffffff');
  });

  it('is active when any trigger is above zero (glow needs strength too)', () => {
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, shadowOpacity: 0.5 })).toBe(true);
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, tintAmount: 0.1 })).toBe(true);
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, glowRadius: 10 })).toBe(true);
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, glowRadius: 10, glowStrength: 0 })).toBe(false);
  });

  it('recognises effect property names', () => {
    expect(isEffectProp('blur')).toBe(true);
    expect(isEffectProp('opacity')).toBe(false);
  });
});
