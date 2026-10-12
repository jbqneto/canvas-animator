import { describe, expect, it } from 'vitest';
import { describeScene } from '../describe';

const base = { name: 'Ep', fps: 24, totalFrames: 240, canvas: { width: 1920, height: 1080 } };

describe('describeScene', () => {
  it('lists objects in time order with seconds', () => {
    const d = describeScene({
      ...base,
      content: {
        texts: [{ id: 't2', text: 'Second text that is rather long and goes on and on forever and ever', startFrame: 49, durationFrames: 24 }],
        actors: [{ id: 'a1', name: 'Plane', startFrame: 1, durationFrames: 48 }],
        markers: [{ id: 'm', frame: 25, label: 'Entry', color: '#fff' }],
      } as any,
    });
    expect(d.durationSec).toBe(10);
    expect(d.items.map((i) => i.id)).toEqual(['a1', 't2']);
    expect(d.items[0]).toMatchObject({ kind: 'actor', label: 'Plane', startSec: 0, endSec: 2 });
    expect(d.items[1].startSec).toBe(2);
    expect(d.items[1].label).toHaveLength(40);
    expect(d.markers).toEqual([{ label: 'Entry', sec: 1 }]);
    expect(d.hasCamera).toBe(false);
  });
  it('handles an empty scene and reports the camera', () => {
    const d = describeScene({ ...base, content: { camera: { base: { panX: 0, panY: 0, zoom: 1, rotation: 0 }, tracks: {} } } as any });
    expect(d.items).toEqual([]);
    expect(d.hasCamera).toBe(true);
  });
  it('lists the effects an object ever turns on', () => {
    const d = describeScene({
      ...base,
      content: {
        texts: [
          { id: 'a', text: 'A', startFrame: 1, durationFrames: 24, tracks: { blur: [{ frame: 1, value: 12 }, { frame: 20, value: 0 }] } },
          { id: 'b', text: 'B', startFrame: 1, durationFrames: 24, tracks: {}, effects: { shadowOpacity: 0.5, glowRadius: 0 } },
          { id: 'c', text: 'C', startFrame: 1, durationFrames: 24, tracks: {} },
        ],
      } as any,
    });
    const byId = Object.fromEntries(d.items.map((i) => [i.id, i.effects]));
    expect(byId).toEqual({ a: ['blur'], b: ['shadow'], c: undefined });
  });

  it('lists maskOnly and mask only when set', () => {
    const d = describeScene({
      ...base,
      content: {
        texts: [
          { id: 't', text: 'Hi', startFrame: 1, durationFrames: 24, mask: { actorId: 'm', mode: 'outside' } },
          { id: 'plain', text: 'No', startFrame: 1, durationFrames: 24 },
        ],
        actors: [{ id: 'm', name: 'Cut', startFrame: 1, durationFrames: 48, maskOnly: true }],
      } as any,
    });
    const byId = Object.fromEntries(d.items.map((i) => [i.id, i]));
    expect(byId.m.maskOnly).toBe(true);
    expect(byId.t.mask).toEqual({ actorId: 'm', mode: 'outside' });
    expect('mask' in byId.plain).toBe(false);
    expect('maskOnly' in byId.plain).toBe(false);
    expect('maskOnly' in byId.t).toBe(false);
  });

  it('reports a camera parallax other than 1', () => {
    const d = describeScene({
      ...base,
      content: { texts: [
        { id: 'a', text: 'A', startFrame: 1, durationFrames: 24, tracks: {}, parallax: 0 },
        { id: 'b', text: 'B', startFrame: 1, durationFrames: 24, tracks: {}, parallax: 1 },
        { id: 'c', text: 'C', startFrame: 1, durationFrames: 24, tracks: {} },
      ] } as any,
    });
    expect(Object.fromEntries(d.items.map((i) => [i.id, i.parallax]))).toEqual({ a: 0, b: undefined, c: undefined });
  });
});
