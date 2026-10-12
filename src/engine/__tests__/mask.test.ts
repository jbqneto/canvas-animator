import { describe, expect, it } from 'vitest';
import { clearMaskRefs, deleteActorLayerScene, deleteActorScene, maskActorOptions, maskPath, resolveMask } from '../mask';
import { createShapeActor, defaultShapeStyle } from '../shapes';
import { sampleActor } from '../actor';
import type { ActorOverlay, Animated } from '../../types';

const shape = (id: string, type: 'rect' | 'ellipse' | 'line' | 'arrow' = 'rect', over: Partial<ActorOverlay> = {}): ActorOverlay => ({
  ...createShapeActor({ id, name: id, style: { ...defaultShapeStyle(type), radius: 0 }, width: 100, height: 50, x: 200, y: 100, startFrame: 1, durationFrames: 30 }),
  ...over,
});
const target = (mask?: Animated['mask'], id = 't'): Animated & { id: string } => ({ ...shape(id), mask });

describe('resolveMask', () => {
  const m = shape('m');
  it('resolves an existing shape in its span', () => {
    const r = resolveMask(target({ actorId: 'm', mode: 'inside' }), [m], 5);
    expect(r?.shape.id).toBe('m');
    expect(r?.mode).toBe('inside');
  });
  it.each([
    ['no mask', undefined],
    ['missing actor', { actorId: 'zz', mode: 'inside' as const }],
    ['self reference', { actorId: 't', mode: 'inside' as const }],
    ['unknown mode', { actorId: 'm', mode: 'weird' as unknown as 'inside' }],
  ])('is null for %s', (_n, mask) => {
    expect(resolveMask(target(mask), [m, shape('t')], 5)).toBeNull();
  });
  it('is null for line shapes, image actors, and outside the mask span', () => {
    expect(resolveMask(target({ actorId: 'l', mode: 'inside' }), [shape('l', 'line')], 5)).toBeNull();
    expect(resolveMask(target({ actorId: 'i', mode: 'inside' }), [{ ...shape('i'), kind: 'image' }], 5)).toBeNull();
    expect(resolveMask(target({ actorId: 'm', mode: 'inside' }), [m], 99)).toBeNull();
  });
  it('is null when the mask transform is not finite', () => {
    const bad = shape('m', 'rect', { base: { ...m.base, x: NaN } });
    expect(resolveMask(target({ actorId: 'm', mode: 'inside' }), [bad], 5)).toBeNull();
  });
  it('is null when the mask size is not finite (corrupt file)', () => {
    for (const over of [{ width: NaN }, { height: Infinity }]) {
      expect(resolveMask(target({ actorId: 'm', mode: 'inside' }), [shape('m', 'rect', over)], 5)).toBeNull();
    }
  });
  it('does not recurse when two objects mask each other', () => {
    const a = { ...shape('a'), mask: { actorId: 'b', mode: 'inside' as const } };
    const b = { ...shape('b'), mask: { actorId: 'a', mode: 'inside' as const } };
    expect(resolveMask(a, [a, b], 5)?.shape.id).toBe('b');
    expect(resolveMask(b, [a, b], 5)?.shape.id).toBe('a');
  });
});

describe('maskPath', () => {
  it('places a rectangle at the actor position', () => {
    const m = shape('m');
    const [c] = maskPath(m, sampleActor(m, 5));
    expect(c).toHaveLength(4);
    expect(c[0]).toEqual({ x: 150, y: 75 });
    expect(c[2]).toEqual({ x: 250, y: 125 });
  });
  it('applies rotation, scale and flipX in canvas order (translate, rotate, scale)', () => {
    const m = shape('m');
    const [c] = maskPath(m, { ...sampleActor(m, 5), rotation: 90, scale: 2 });
    expect(c[0].x).toBeCloseTo(200 + 50, 5); // (-50,-25)*2 = (-100,-50) -> rotate 90 -> (50,-100)
    expect(c[0].y).toBeCloseTo(100 - 100, 5);
    const flipped = shape('f', 'arrow', { flipX: true });
    const [fc] = maskPath(flipped, sampleActor(flipped, 5));
    const [plain] = maskPath(shape('p', 'arrow'), sampleActor(shape('p', 'arrow'), 5));
    expect(fc[0].x).toBeCloseTo(400 - plain[0].x, 5);
  });
  it('uses a dense polygon for ellipses and rounded corners, never NaN', () => {
    const e = shape('e', 'ellipse');
    expect(maskPath(e, sampleActor(e, 5))[0].length).toBeGreaterThanOrEqual(48);
    const r = shape('r', 'rect', { shape: { ...defaultShapeStyle('rect'), radius: 20 } });
    const pts = maskPath(r, sampleActor(r, 5))[0];
    expect(pts.length).toBeGreaterThan(16);
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    const z = shape('z', 'rect', { width: 0, height: 0 });
    expect(maskPath(z, { ...sampleActor(z, 5), scale: 0 })[0].every((p) => Number.isFinite(p.x))).toBe(true);
  });
});

describe('clearMaskRefs', () => {
  it('removes only the references to the deleted actor, in every object list', () => {
    const scene = {
      actors: [target({ actorId: 'm', mode: 'inside' }, 'a1'), target({ actorId: 'other', mode: 'inside' }, 'a2')],
      sticks: [target({ actorId: 'm', mode: 'outside' }, 's1')],
      charts: [target({ actorId: 'm', mode: 'inside' }, 'c1')],
      texts: [target(undefined, 'x1')],
    } as any;
    const next = clearMaskRefs(scene, 'm');
    expect(next.actors[0].mask).toBeUndefined();
    expect('mask' in next.actors[0]).toBe(false);
    expect(next.actors[1].mask).toEqual({ actorId: 'other', mode: 'inside' });
    expect(next.sticks[0].mask).toBeUndefined();
    expect(next.charts[0].mask).toBeUndefined();
    expect(next.texts[0]).toBe(scene.texts[0]);
  });
  it('does not add a sticks key when the scene had none', () => {
    const scene = { actors: [target({ actorId: 'm', mode: 'inside' }, 'a1')], charts: [], texts: [] };
    const next = clearMaskRefs(scene, 'm');
    expect('sticks' in next).toBe(false);
    expect('mask' in next.actors[0]).toBe(false);
  });
});

describe('deleteActorScene', () => {
  it('removes the actor, its layers and the mask references in one scene', () => {
    const scene = {
      actors: [shape('m'), target({ actorId: 'm', mode: 'inside' }, 'a1')],
      layers: [{ targetId: 'm' }, { targetId: 'a1' }],
      charts: [], texts: [],
    } as any;
    const next = deleteActorScene(scene, 'm');
    expect(next.actors.map((a: any) => a.id)).toEqual(['a1']);
    expect('mask' in next.actors[0]).toBe(false);
    expect(next.layers).toEqual([{ targetId: 'a1' }]);
  });
});

describe('maskActorOptions', () => {
  it('lists only maskOnly, non-line shape actors', () => {
    const list = [shape('a', 'rect', { maskOnly: true }), shape('b'), shape('c', 'line', { maskOnly: true }),
      { ...shape('d', 'ellipse', { maskOnly: true }), kind: 'image' as const }];
    expect(maskActorOptions(list)).toEqual([{ id: 'a', name: 'a' }]);
  });
});

describe('maskActorOptions with a current reference', () => {
  it('keeps listing a referenced usable shape that is no longer maskOnly, but never a line', () => {
    const list = [shape('a'), shape('b'), shape('c', 'line')];
    expect(maskActorOptions(list)).toEqual([]);
    expect(maskActorOptions(list, 'a')).toEqual([{ id: 'a', name: 'a' }]);
    expect(maskActorOptions(list, 'c')).toEqual([]);
  });
});

describe('deleteActorLayerScene', () => {
  it('removes the actor and its layer and clears the mask refs in one scene', () => {
    const scene = {
      actors: [shape('m', 'rect', { maskOnly: true }), shape('k')],
      sticks: [target({ actorId: 'm', mode: 'inside' }, 's')],
      charts: [],
      texts: [target({ actorId: 'm', mode: 'outside' }, 'x'), target({ actorId: 'k', mode: 'inside' }, 'y')],
      layers: [{ id: 'L1', targetId: 'm' }, { id: 'L2', targetId: 'k' }],
    };
    const next = deleteActorLayerScene(scene, 'L1', 'm');
    expect(next.actors.map((a) => a.id)).toEqual(['k']);
    expect(next.layers.map((l) => l.id)).toEqual(['L2']);
    expect('mask' in next.sticks![0]).toBe(false);
    expect('mask' in next.texts[0]).toBe(false);
    expect(next.texts[1].mask).toEqual({ actorId: 'k', mode: 'inside' });
  });
});
