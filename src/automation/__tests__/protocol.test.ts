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

describe('set_effects command', () => {
  it('accepts base values, colors and keyed tracks', () => {
    expect(commandSchema.parse({ method: 'set_effects', objectId: 't1', base: { shadowOpacity: 0.6, shadowColor: '#112233' } })).toBeTruthy();
    expect(commandSchema.parse({ method: 'set_effects', objectId: 't1', tracks: { blur: [{ frame: 1, value: 12, easing: 'easeOut' }, { frame: 20, value: 0 }] } })).toBeTruthy();
  });
  it('rejects unknown properties, bad colors and a missing object', () => {
    expect(() => commandSchema.parse({ method: 'set_effects', objectId: 't1', base: { sparkle: 1 } })).toThrow();
    expect(() => commandSchema.parse({ method: 'set_effects', objectId: 't1', base: { glowColor: 'red' } })).toThrow();
    expect(() => commandSchema.parse({ method: 'set_effects', objectId: 't1', tracks: { shadowColor: [] } })).toThrow();
    expect(() => commandSchema.parse({ method: 'set_effects', base: { blur: 1 } })).toThrow();
  });
});
