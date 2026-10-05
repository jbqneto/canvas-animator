import { describe, expect, it } from 'vitest';
import type { StudioLayer } from '../../types';
import { addToSharedLayer, layerHolds, layerTargets, withoutTarget } from '../layers';
import { resolveObjectLayer } from '../../utils/exportVideo';

const base = { visible: true, locked: false, color: '#fff' };
const single: StudioLayer = { ...base, id: 'l-a', name: 'A', type: 'text', targetId: 'a' };
const track: StudioLayer = { ...base, id: 'l-cap', name: 'Captions', type: 'text', targetIds: ['c1', 'c2'] };

describe('layers holding objects', () => {
  it('lists and finds the objects of single and shared layers', () => {
    expect(layerTargets(single)).toEqual(['a']);
    expect(layerTargets(track)).toEqual(['c1', 'c2']);
    expect(layerTargets({ ...base, id: 'v', name: 'V', type: 'video' })).toEqual([]);
    expect(layerHolds(track, 'c2')).toBe(true);
    expect(layerHolds(single, 'c2')).toBe(false);
  });

  it('removes a deleted object: its own layer goes, a shared layer shrinks and goes when empty', () => {
    expect(withoutTarget([single, track], 'a')).toEqual([track]);
    expect(withoutTarget([single, track], 'c1')).toEqual([single, { ...track, targetIds: ['c2'] }]);
    expect(withoutTarget([{ ...track, targetIds: ['c1'] }], 'c1')).toEqual([]);
  });

  it('creates the shared layer on top, or appends without duplicates', () => {
    expect(addToSharedLayer([single], { ...track, targetIds: [] }, ['x'])).toEqual([{ ...track, targetIds: ['x'] }, single]);
    expect(addToSharedLayer([single, track], track, ['c2', 'c3'])[1].targetIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('resolves an object to the shared layer that holds it (visibility, lock and depth)', () => {
    const other: StudioLayer = { ...base, id: 'l-b', name: 'B', type: 'text', targetId: 'b' };
    expect(resolveObjectLayer([other, track], 'c2', 'text')).toEqual({ index: 1, layer: track });
  });
});
