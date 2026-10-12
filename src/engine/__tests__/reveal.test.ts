import { describe, expect, it } from 'vitest';
import { drawProgress, fillAlpha, shapeOutlineLength, validDrawFrames } from '../reveal';
import { defaultShapeStyle } from '../shapes';

describe('drawProgress', () => {
  it('goes 0 -> 1 over the frames with ease in/out', () => {
    expect(drawProgress(10, 20, 10)).toBe(0);
    expect(drawProgress(10, 20, 20)).toBeCloseTo(0.5, 5);
    expect(drawProgress(10, 20, 30)).toBe(1);
    expect(drawProgress(10, 20, 99)).toBe(1);
    expect(drawProgress(10, 20, 5)).toBe(0);
    expect(drawProgress(10, 20, 15)).toBeLessThan(0.25); // slow start
  });
  it('means "no effect" (1) for invalid frames', () => {
    for (const f of [0, -4, NaN, Infinity, undefined, '8' as unknown as number]) expect(drawProgress(1, f, 1)).toBe(1);
  });
});

describe('fillAlpha', () => {
  it('stays 0 while tracing, then fades in over half the draw time', () => {
    expect(fillAlpha(1, 20, 10)).toBe(0);
    expect(fillAlpha(1, 20, 21)).toBe(0);
    expect(fillAlpha(1, 20, 26)).toBeCloseTo(0.5, 5); // fade = round(20/2) = 10 frames
    expect(fillAlpha(1, 20, 31)).toBe(1);
  });
  it('is 1 for invalid frames and fades in at least one frame', () => {
    expect(fillAlpha(1, 0, 1)).toBe(1);
    expect(fillAlpha(1, 1, 2)).toBe(0); // trace ends at frame 2
    expect(fillAlpha(1, 1, 3)).toBe(1); // one-frame fade
  });
});

describe('validDrawFrames', () => {
  it('returns the frames or 0', () => {
    expect(validDrawFrames({ frames: 12 })).toBe(12);
    for (const bad of [undefined, null, {}, { frames: 0 }, { frames: -1 }, { frames: NaN }, { frames: '5' }]) expect(validDrawFrames(bad)).toBe(0);
  });
});

describe('shapeOutlineLength', () => {
  const rect = (radius: number) => ({ ...defaultShapeStyle('rect'), radius });
  it('measures rectangles, rounded rectangles, circles, lines and arrows', () => {
    expect(shapeOutlineLength(rect(0), 100, 50)).toBe(300);
    expect(shapeOutlineLength(rect(10), 100, 50)).toBeCloseTo(300 - 80 + 2 * Math.PI * 10, 5);
    expect(shapeOutlineLength(defaultShapeStyle('ellipse'), 100, 100)).toBeCloseTo(2 * Math.PI * 50, 2);
    expect(shapeOutlineLength(defaultShapeStyle('line'), 120, 16)).toBe(120);
    expect(shapeOutlineLength(defaultShapeStyle('arrow'), 120, 60)).toBeGreaterThan(300);
  });
  it('never returns NaN for a degenerate box', () => {
    expect(shapeOutlineLength(rect(5), 0, 0)).toBe(0);
  });
});
