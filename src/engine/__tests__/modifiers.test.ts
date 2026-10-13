import { describe, expect, it } from 'vitest';
import { cleanModifier, loopFrame, shakeOffset } from '../modifiers';
import { createActor, sampleActor, setActorProperty, toggleAnimated } from '../actor';

const keys = [{ frame: 10, value: 0 }, { frame: 20, value: 1 }] as never;

describe('loopFrame', () => {
  it('leaves frames inside the keys, before them and unlooped tracks alone', () => {
    expect(loopFrame(keys, 15, 'cycle')).toBe(15);
    expect(loopFrame(keys, 5, 'cycle')).toBe(5);
    expect(loopFrame(keys, 35, undefined)).toBe(35);
    expect(loopFrame(undefined, 35, 'cycle')).toBe(35);
    expect(loopFrame(keys, 35, 'zigzag' as never)).toBe(35);
    expect(loopFrame([{ frame: 10, value: 1 }] as never, 35, 'cycle')).toBe(35);
  });
  it('cycle jumps back to the first key', () => {
    expect(loopFrame(keys, 21, 'cycle')).toBe(11);
    expect(loopFrame(keys, 30, 'cycle')).toBe(10);
    expect(loopFrame(keys, 35, 'cycle')).toBe(15);
  });
  it('pingpong plays the keys backwards after the last one', () => {
    expect(loopFrame(keys, 25, 'pingpong')).toBe(15);
    expect(loopFrame(keys, 30, 'pingpong')).toBe(10);
    expect(loopFrame(keys, 35, 'pingpong')).toBe(15);
    expect(loopFrame(keys, 40, 'pingpong')).toBe(20);
  });
});

describe('shakeOffset', () => {
  it('is deterministic, bounded by the amount and different per seed', () => {
    expect(shakeOffset('a:x', 37, 5, 4)).toBe(shakeOffset('a:x', 37, 5, 4));
    for (let f = 1; f < 200; f++) expect(Math.abs(shakeOffset('a:x', f, 5, 4))).toBeLessThanOrEqual(5);
    const xs = Array.from({ length: 30 }, (_, f) => shakeOffset('a:x', f, 5, 4));
    const ys = Array.from({ length: 30 }, (_, f) => shakeOffset('a:y', f, 5, 4));
    expect(xs).not.toEqual(ys);
    expect(new Set(xs).size).toBeGreaterThan(10);
  });
  it('smoothly evaluates a deterministic shake at fractional frames', () => {
    const a = shakeOffset('motion:position', 18.25, 5, 4);
    expect(a).toBe(shakeOffset('motion:position', 18.25, 5, 4));
    expect(a).not.toBe(shakeOffset('motion:position', 18.75, 5, 4));
  });
  it('is smooth: neighbouring frames are close compared with the amount', () => {
    for (let f = 1; f < 100; f++) expect(Math.abs(shakeOffset('s', f + 1, 10, 8) - shakeOffset('s', f, 10, 8))).toBeLessThan(4);
  });
  it('is zero with no amount and tolerates a bad period', () => {
    expect(shakeOffset('s', 9, 0, 4)).toBe(0);
    expect(shakeOffset('s', 9, '5' as never, 4)).toBe(0);
    expect(Number.isFinite(shakeOffset('s', 9, 3, NaN))).toBe(true);
    expect(Number.isFinite(shakeOffset('s', 9, 3, 0))).toBe(true);
  });
});

describe('cleanModifier', () => {
  it('clamps amount and period, drops junk and empties', () => {
    expect(cleanModifier('opacity', { shake: { amount: 5, periodFrames: 3.6 } })).toEqual({ shake: { amount: 1, periodFrames: 4 } });
    expect(cleanModifier('position', { loop: 'cycle', shake: { amount: 0, periodFrames: 4 } })).toEqual({ loop: 'cycle' });
    expect(cleanModifier('scale', { loop: 'weird' as never })).toBeUndefined();
    expect(cleanModifier('scale', { shake: { amount: NaN, periodFrames: 4 } })).toBeUndefined();
    expect(cleanModifier('scale', undefined)).toBeUndefined();
  });
});

describe('sampleActor with modifiers', () => {
  const base = () => {
    let a = createActor({ id: 'a1', name: 'a', src: 'data:', width: 10, height: 10, x: 100, y: 100, startFrame: 1, durationFrames: 200 });
    a = toggleAnimated(a, 'rotation', 10);
    a = setActorProperty(a, 'rotation', 10, 0);
    a = setActorProperty(a, 'rotation', 20, 90);
    return a;
  };
  it('is identical to plain sampling without modifiers', () => {
    const a = base();
    expect(sampleActor(a, 35)).toEqual(sampleActor({ ...a, modifiers: undefined }, 35));
    expect(sampleActor(a, 35).rotation).toBe(90);
  });
  it('loops the rotation keys after the last one', () => {
    const a = { ...base(), modifiers: { rotation: { loop: 'cycle' as const } } };
    expect(sampleActor(a, 15).rotation).toBeCloseTo(45);
    expect(sampleActor(a, 25).rotation).toBeCloseTo(45); // back to frame 15
    expect(sampleActor(a, 30).rotation).toBeCloseTo(0);
    const ping = { ...base(), modifiers: { rotation: { loop: 'pingpong' as const } } };
    expect(sampleActor(ping, 25).rotation).toBeCloseTo(45); // 25 mirrors 15
  });
  it('shakes position around the resting spot, independently per axis, and keeps opacity in range', () => {
    const a = { ...base(), modifiers: { position: { shake: { amount: 6, periodFrames: 3 } }, opacity: { shake: { amount: 1, periodFrames: 2 } } } };
    const states = Array.from({ length: 60 }, (_, f) => sampleActor(a, f + 1));
    expect(states.every((s) => Math.abs(s.x - 100) <= 6 && Math.abs(s.y - 100) <= 6)).toBe(true);
    expect(states.some((s) => s.x !== 100)).toBe(true);
    expect(states.map((s) => s.x - 100)).not.toEqual(states.map((s) => s.y - 100));
    expect(states.every((s) => s.opacity >= 0 && s.opacity <= 1)).toBe(true);
  });
  it('keeps a shake the same for the same frame', () => {
    const a = { ...base(), modifiers: { scale: { shake: { amount: 0.2, periodFrames: 5 } } } };
    expect(sampleActor(a, 42).scale).toBe(sampleActor(a, 42).scale);
  });
});
