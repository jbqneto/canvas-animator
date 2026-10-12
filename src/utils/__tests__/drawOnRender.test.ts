import { describe, expect, it } from 'vitest';
import { renderCompositeFrame, type SceneContent } from '../exportVideo';
import { createShapeActor, defaultShapeStyle } from '../../engine/shapes';
import { drawProgress, fillAlpha, shapeOutlineLength } from '../../engine/reveal';
import { createCanvasStub, type CtxCall } from '../../test/canvasStub';
import type { ActorOverlay, MotionPath, ShapeStyle } from '../../types';

const shape = (style: Partial<ShapeStyle> = {}, type: ShapeStyle['type'] = 'rect'): ActorOverlay =>
  createShapeActor({
    id: 's', name: 's', style: { ...defaultShapeStyle(type), strokeWidth: 4, ...style }, width: 100, height: 50, x: 200, y: 100, startFrame: 1, durationFrames: 60,
  });
const scene = (actors: ActorOverlay[], paths: MotionPath[] = []): SceneContent => ({
  frames: {}, charts: [], images: [], actors, paths, layers: [], fps: 24, texts: [],
  videoBg: { type: 'color', color: '#000', opacity: 1, playbackRate: 1 },
});
const render = (s: SceneContent, frame: number) => {
  const { ctx, calls, props } = createCanvasStub();
  renderCompositeFrame(ctx, 1280, 720, frame, s);
  return { calls, props };
};
const count = (calls: CtxCall[], name: string) => calls.filter((c) => c.name === name).length;
const expectBalanced = (calls: CtxCall[]) => expect(count(calls, 'save')).toBe(count(calls, 'restore'));
const alphaAt = (calls: CtxCall[], index: number) => {
  for (let i = index; i >= 0; i--) if (calls[i].name === 'set:globalAlpha') return calls[i].args[0] as number;
  return 1;
};
const withDraw = (extra: Partial<ShapeStyle> = {}, type: ShapeStyle['type'] = 'rect') => shape({ draw: { frames: 20 }, ...extra }, type);

describe('draw-on for shapes', () => {
  it('draws nothing at progress 0', () => {
    const { calls } = render(scene([withDraw()]), 1);
    expect(count(calls, 'stroke')).toBe(0);
    expect(count(calls, 'fill')).toBe(0);
    expectBalanced(calls);
  });

  it('traces the outline with a dash while the fill waits', () => {
    const { calls } = render(scene([withDraw()]), 11);
    const L = shapeOutlineLength(defaultShapeStyle('rect'), 100, 50) * 1.02;
    const dash = calls.find((c) => c.name === 'setLineDash');
    expect(dash!.args[0]).toEqual([expect.closeTo(L, 5), expect.closeTo(L, 5)]);
    const offset = calls.find((c) => c.name === 'set:lineDashOffset');
    expect(offset!.args[0] as number).toBeCloseTo(L * (1 - drawProgress(1, 20, 11)), 5);
    expect(count(calls, 'stroke')).toBe(1);
    expect(count(calls, 'fill')).toBe(0);
    expectBalanced(calls);
  });

  it('fades the fill in after the trace, without a dash', () => {
    const { calls } = render(scene([withDraw()]), 26);
    expect(fillAlpha(1, 20, 26)).toBeCloseTo(0.5);
    const fill = calls.findIndex((c) => c.name === 'fill');
    expect(fill).toBeGreaterThan(-1);
    expect(alphaAt(calls, fill)).toBeCloseTo(0.5);
    const dashes = calls.filter((c) => c.name === 'setLineDash').map((c) => c.args[0] as number[]);
    expect(dashes.every((d) => d.length === 0)).toBe(true);
    // the alpha is restored after the fill
    expectBalanced(calls);
  });

  it('is identical to a shape without draw once finished', () => {
    const a = render(scene([withDraw()]), 45).calls;
    const b = render(scene([shape()]), 45).calls;
    expect(a).toEqual(b);
  });

  it('ignores draw when strokeWidth is 0', () => {
    const a = render(scene([withDraw({ strokeWidth: 0 })]), 5).calls;
    const b = render(scene([shape({ strokeWidth: 0 })]), 5).calls;
    expect(a).toEqual(b);
  });

  it('traces a line shape across its width', () => {
    const { calls } = render(scene([withDraw({ strokeWidth: 6 }, 'line')]), 11);
    const dash = calls.find((c) => c.name === 'setLineDash');
    expect(dash!.args[0]).toEqual([expect.closeTo(102, 5), expect.closeTo(102, 5)]);
    expect(count(calls, 'stroke')).toBe(1);
    expectBalanced(calls);
  });

  it('draws nothing for a line at progress 0', () => {
    const { calls } = render(scene([withDraw({ strokeWidth: 6 }, 'line')]), 1);
    expect(count(calls, 'stroke')).toBe(0);
    expectBalanced(calls);
  });

  it.each([[NaN], [-3], ['5' as unknown as number]])('ignores an invalid draw (%s)', (frames) => {
    const a = render(scene([shape({ draw: { frames } })]), 5).calls;
    const b = render(scene([shape()]), 5).calls;
    expect(a).toEqual(b);
  });
});

describe('draw-on for paths', () => {
  const path = (style: Partial<MotionPath['style']>): MotionPath => ({
    id: 'p', name: 'p', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], smooth: false, closed: false,
    style: { visible: true, color: '#fff', width: 3, stroke: 'solid', reveal: 'draw', drawFrames: 10, ...style },
    startFrame: 1, durationFrames: 100,
  });
  const lastLineTo = (calls: CtxCall[]) => [...calls].reverse().find((c) => c.name === 'lineTo')?.args as number[] | undefined;

  it('strokes nothing at the start', () => {
    const { calls } = render(scene([], [path({})]), 1);
    expect(count(calls, 'stroke')).toBe(0);
    expectBalanced(calls);
  });

  it('reaches a partial point mid-trace and the end at the end', () => {
    const mid = lastLineTo(render(scene([], [path({})]), 6).calls)!;
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(100);
    const end = lastLineTo(render(scene([], [path({})]), 11).calls)!;
    expect(end[0]).toBeCloseTo(100);
    expect(end[1]).toBeCloseTo(0);
  });

  it('defaults to 24 frames', () => {
    const p = path({ drawFrames: undefined });
    expect(lastLineTo(render(scene([], [p]), 12).calls)![0]).toBeLessThan(100);
    expect(lastLineTo(render(scene([], [p]), 25).calls)![0]).toBeCloseTo(100);
  });

  it('full is drawn whole from the first frame', () => {
    const calls = render(scene([], [path({ reveal: 'full' })]), 1).calls;
    expect(lastLineTo(calls)![0]).toBeCloseTo(100);
  });
});
