import { describe, expect, it } from 'vitest';
import { arrowPolygon, createShapeActor, defaultShapeStyle, fittedRadius, normalizeShape } from '../shapes';
import { hitTestActor } from '../actor';

const make = (type: 'rect' | 'line', height = 50) =>
  createShapeActor({
    id: 's',
    name: 'forma',
    style: defaultShapeStyle(type, '#ff0000'),
    width: 200,
    height,
    x: 100,
    y: 100,
    startFrame: 1,
    durationFrames: 10,
  });

describe('shape actors', () => {
  it('are actors of kind "shape" with an editable style and no image', () => {
    const s = make('rect');
    expect(s.kind).toBe('shape');
    expect(s.src).toBe('');
    expect(s.shape).toMatchObject({ type: 'rect', fill: '#ff0000' });
    expect(hitTestActor(s, 5, { x: 190, y: 120 })).toBe(true);
  });

  it('keeps lines tall enough to click', () => {
    expect(make('line', 2).height).toBe(16);
  });

  it('fits the arrow and the corner radius inside the box', () => {
    const pts = arrowPolygon(120, 60);
    expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBe(60);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBe(30);
    expect(fittedRadius(100, 120, 60)).toBe(30);
  });

  it('repairs shapes read from a file and leaves images alone', () => {
    const broken = { ...make('rect'), shape: { type: 'star', fill: 3, strokeWidth: -1 } as any };
    expect(normalizeShape(broken).shape).toEqual({ ...defaultShapeStyle('rect'), fill: '#38bdf8' });
    const image = { ...make('rect'), kind: 'image' as const, src: 'data:x', shape: undefined };
    expect(normalizeShape(image)).toBe(image);
  });
});
