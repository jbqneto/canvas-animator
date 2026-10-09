import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from '../color';

describe('color', () => {
  it('parses #rgb and #rrggbb', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('#E8B65A')).toEqual([232, 182, 90]);
  });
  it('returns null for anything else', () => {
    for (const v of ['red', 'rgba(0,0,0,.5)', '#12', '#gggggg', '', 'transparent']) expect(parseHex(v)).toBeNull();
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#336699', '#336699')).toBe(1);
    expect(contrastRatio('#222222', '#000000')!).toBeLessThan(2);
  });
  it('is null when a color is not hex', () => {
    expect(contrastRatio('red', '#000')).toBeNull();
  });
});
