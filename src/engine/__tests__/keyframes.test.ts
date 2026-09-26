import { describe, expect, it } from 'vitest';
import {
  applyEasing,
  EASING_OPTIONS,
  hasKeyframeAt,
  moveKeyframe,
  pathPolyline,
  removeKeyframe,
  samplePosition,
  sampleTrack,
  setKeyframe,
  Track,
  Vec2,
} from '../keyframes';

describe('applyEasing', () => {
  it.each(EASING_OPTIONS.map((o) => o.id))('%s maps 0 -> 0 and 1 -> 1', (name) => {
    expect(applyEasing(name, 0)).toBeCloseTo(0);
    expect(applyEasing(name, 1)).toBeCloseTo(1);
  });

  it('hold jumps only at the end of the segment', () => {
    expect(applyEasing('hold', 0.99)).toBe(0);
  });

  it('backOut overshoots', () => {
    const max = Math.max(...Array.from({ length: 50 }, (_, i) => applyEasing('backOut', i / 49)));
    expect(max).toBeGreaterThan(1);
  });
});

describe('sampleTrack', () => {
  const track: Track<number> = [
    { frame: 10, value: 0, easing: 'linear' },
    { frame: 20, value: 100, easing: 'hold' },
    { frame: 30, value: 50 },
  ];

  it('uses the fallback when there are no keys', () => {
    expect(sampleTrack([], 5, 42)).toBe(42);
    expect(sampleTrack(undefined, 5, 42)).toBe(42);
  });

  it('clamps before the first and after the last key', () => {
    expect(sampleTrack(track, 1, -1)).toBe(0);
    expect(sampleTrack(track, 99, -1)).toBe(50);
  });

  it('interpolates with the easing of the starting key', () => {
    expect(sampleTrack(track, 15, 0)).toBe(50);
    expect(sampleTrack(track, 25, 0)).toBe(100); // hold
    expect(sampleTrack(track, 30, 0)).toBe(50);
  });
});

describe('track editing', () => {
  it('setKeyframe inserts sorted and replaces keeping easing', () => {
    let t = setKeyframe<number>([], 20, 1, 'linear');
    t = setKeyframe(t, 10, 0);
    expect(t.map((k) => k.frame)).toEqual([10, 20]);
    t = setKeyframe(t, 20, 5);
    expect(t[1]).toEqual({ frame: 20, value: 5, easing: 'linear' });
  });

  it('removes, moves and finds keys', () => {
    let t = setKeyframe(setKeyframe<number>([], 1, 0), 10, 1);
    expect(hasKeyframeAt(t, 10)).toBe(true);
    t = moveKeyframe(t, 10, 5);
    expect(t.map((k) => k.frame)).toEqual([1, 5]);
    t = removeKeyframe(t, 1);
    expect(t.map((k) => k.frame)).toEqual([5]);
  });
});

describe('samplePosition', () => {
  const route: Track<Vec2> = [
    { frame: 1, value: { x: 0, y: 0 }, easing: 'linear' },
    { frame: 11, value: { x: 100, y: 0 }, easing: 'linear' },
    { frame: 21, value: { x: 100, y: 100 } },
  ];

  it('passes exactly through every key', () => {
    for (const smooth of [true, false]) {
      for (const k of route) {
        const p = samplePosition(route, k.frame, { x: 0, y: 0 }, smooth);
        expect(p.x).toBeCloseTo(k.value.x);
        expect(p.y).toBeCloseTo(k.value.y);
      }
    }
  });

  it('straight path is linear and oriented along the segment', () => {
    const p = samplePosition(route, 6, { x: 0, y: 0 }, false);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
    expect(p.angle).toBeCloseTo(0);
    expect(samplePosition(route, 16, { x: 0, y: 0 }, false).angle).toBeCloseTo(90);
  });

  it('smooth path curves (leaves the straight line) near the corner', () => {
    const p = samplePosition(route, 9, { x: 0, y: 0 }, true);
    expect(Math.abs(p.y)).toBeGreaterThan(0.5);
  });

  it('smooth path has near-constant speed with linear easing', () => {
    const steps = Array.from({ length: 10 }, (_, i) => samplePosition(route, 1 + i, { x: 0, y: 0 }, true));
    const d = steps.slice(1).map((p, i) => Math.hypot(p.x - steps[i].x, p.y - steps[i].y));
    const avg = d.reduce((a, b) => a + b) / d.length;
    d.forEach((v) => expect(Math.abs(v - avg) / avg).toBeLessThan(0.1));
  });

  it('uses the fallback without keys and holds a single key', () => {
    expect(samplePosition([], 5, { x: 7, y: 8 })).toEqual({ x: 7, y: 8, angle: 0 });
    expect(samplePosition([route[1]], 5, { x: 0, y: 0 })).toEqual({ x: 100, y: 0, angle: 0 });
  });

  it('pathPolyline starts and ends at the first/last key', () => {
    const line = pathPolyline(route, true, 10);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1].x).toBeCloseTo(100);
    expect(line[line.length - 1].y).toBeCloseTo(100);
    expect(line).toHaveLength(21);
  });
});
