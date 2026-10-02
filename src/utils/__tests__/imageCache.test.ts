import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedImage, preloadImages } from '../imageCache';

let created: { complete: boolean; naturalWidth: number; src: string; decode: ReturnType<typeof vi.fn> }[];
beforeEach(() => {
  created = [];
  vi.stubGlobal('Image', class {
    complete = true;
    naturalWidth = 100;
    src = '';
    decode = vi.fn().mockResolvedValue(undefined);
    constructor() { created.push(this); }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('image preflight', () => {
  it('decodes and deduplicates images before export', async () => {
    await preloadImages(['test:ready', 'test:ready']);
    expect(created).toHaveLength(1);
    expect(created[0].decode).toHaveBeenCalledTimes(1);
  });

  it('rejects broken images even when the browser marks them complete, then permits retry', async () => {
    const img = getCachedImage('test:broken');
    created[0].naturalWidth = 0;
    created[0].decode.mockRejectedValue(new Error('Image unavailable'));
    expect(img.complete).toBe(true);
    await expect(preloadImages(['test:broken'])).rejects.toThrow();
    await expect(preloadImages(['test:broken'])).resolves.toBeUndefined();
    expect(created).toHaveLength(2);
  });

  it('rejects a zero-size image even if decode resolves', async () => {
    getCachedImage('test:empty');
    created[0].naturalWidth = 0;
    await expect(preloadImages(['test:empty'])).rejects.toThrow();
  });
});
