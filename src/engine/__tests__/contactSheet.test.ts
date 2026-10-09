import { describe, expect, it } from 'vitest';
import { contactSheetLayout, evenFrames } from '../contactSheet';

describe('evenFrames', () => {
  it('spreads frames across the range, ends included', () => {
    expect(evenFrames(1, 101, 5)).toEqual([1, 26, 51, 76, 101]);
  });
  it('returns the start for one frame or an empty range', () => {
    expect(evenFrames(5, 50, 1)).toEqual([5]);
    expect(evenFrames(5, 5, 4)).toEqual([5]);
    expect(evenFrames(9, 3, 4)).toEqual([9]);
  });
  it('never repeats a frame when the range is shorter than the count', () => {
    expect(evenFrames(1, 3, 10)).toEqual([1, 2, 3]);
  });
});

describe('contactSheetLayout', () => {
  it('places cells in rows with gaps and labels', () => {
    const l = contactSheetLayout({ count: 5, columns: 3, cellWidth: 100, aspect: 0.5 });
    expect(l.cellHeight).toBe(50);
    expect(l.cells[0]).toEqual({ x: 8, y: 8 });
    expect(l.cells[3]).toEqual({ x: 8, y: 8 + 28 + 50 + 8 });
    expect(l.width).toBe(8 + 3 * (100 + 8));
    expect(l.height).toBe(8 + 2 * (28 + 50 + 8));
  });
});
