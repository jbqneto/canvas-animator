import { describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../worldMap';

const feature = vi.hoisted(() => vi.fn());
vi.mock('world-atlas/countries-50m.json', () => ({ default: { objects: { countries: {} } } }));
vi.mock('topojson-client', () => ({ feature }));

describe('world map loading', () => {
  it('allows retry after a failed load and caches only a successful result', async () => {
    feature.mockImplementationOnce(() => { throw new Error('Temporary map failure'); });
    await expect(loadWorld('en-US')).rejects.toThrow('Temporary map failure');
    feature.mockReturnValue({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: '076', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
    });
    const loaded = loadWorld('en-US');
    expect((await loaded).countries[0]).toMatchObject({ id: '076', name: 'Brazil' });
    expect(loadWorld('en-US')).toBe(loaded);
    expect(feature).toHaveBeenCalledTimes(2);
  });
});
