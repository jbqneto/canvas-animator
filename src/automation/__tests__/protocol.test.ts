import { describe, expect, it } from 'vitest';
import { commandSchema } from '../protocol';

describe('set_camera command', () => {
  it('accepts a camera, a partial camera and null', () => {
    expect(commandSchema.parse({ method: 'set_camera', camera: null })).toBeTruthy();
    expect(commandSchema.parse({ method: 'set_camera', camera: { base: { zoom: 1.1 } } })).toBeTruthy();
    expect(
      commandSchema.parse({ method: 'set_camera', camera: { tracks: { zoom: [{ frame: 1, value: 1, easing: 'linear' }, { frame: 90, value: 1.2 }] } } })
    ).toBeTruthy();
  });
  it('rejects unknown keys, non-numbers and unknown easings', () => {
    expect(() => commandSchema.parse({ method: 'set_camera', camera: { base: { zoom: 'x' } } })).toThrow();
    expect(() => commandSchema.parse({ method: 'set_camera', camera: { extra: 1 } })).toThrow();
    expect(() => commandSchema.parse({ method: 'set_camera', camera: { tracks: { zoom: [{ frame: 1, value: 1, easing: 'wobble' }] } } })).toThrow();
    expect(() => commandSchema.parse({ method: 'set_camera' })).toThrow();
  });
});
