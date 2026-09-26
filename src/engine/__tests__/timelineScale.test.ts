import { describe, expect, it } from 'vitest';
import { clampZoom, fitPxPerFrame, formatSeconds, scrollForZoom, timelineScale } from '../timelineScale';

describe('timelineScale', () => {
  it('numbers frame cells, spacing labels so they never overlap', () => {
    const s = timelineScale(60, 24, 20, 'frames');
    expect(s.major).toBe(5); // 5 frames × 20 px = 100 px ≥ 56
    expect(s.minor).toBe(1);
    expect(s.labels.slice(0, 3)).toEqual([
      { x: 0, text: '1' },
      { x: 4 / 60, text: '5' },
      { x: 9 / 60, text: '10' },
    ]);
  });

  it('marks time in seconds at the boundary where each second starts', () => {
    const s = timelineScale(240, 24, 3, 'seconds'); // 1 s = 72 px
    expect(s.major).toBe(24);
    expect(s.labels.map((l) => l.text).slice(0, 3)).toEqual(['0s', '1s', '2s']);
    expect(s.labels[1].x).toBeCloseTo(24 / 240);
    // faint lines at the densest readable time that divides a second (0.25 s = 18 px)
    expect(s.minor).toBe(6);
  });

  it('uses sub-second and whole-frame steps when zoomed in, minutes when zoomed out', () => {
    const near = timelineScale(240, 24, 40, 'seconds');
    expect(near.major).toBe(6); // 0.25 s = 240 px
    expect(near.minor).toBe(1); // every frame
    expect(near.labels[1].text).toBe('0.25s');
    const mid = timelineScale(240, 30, 12, 'seconds');
    expect(mid.major).toBe(15); // 0.5 s
    expect(mid.labels[1].text).toBe('0.5s');
    const frameByFrame = timelineScale(48, 24, 60, 'seconds');
    expect(frameByFrame.major).toBe(1);
    expect(frameByFrame.labels.map((l) => l.text).slice(22, 27)).toEqual(['22f', '23f', '1s', '1f', '2f']);
    const far = timelineScale(24 * 600, 24, 0.05, 'seconds');
    expect(far.labels[1].text).toBe('1:00');
  });

  it('keeps faint lines readable, and drops them when every frame is already labelled', () => {
    for (const px of [0.05, 0.18, 1, 7]) {
      const { minor } = timelineScale(7200, 24, px, 'frames');
      if (minor) expect(minor * px).toBeGreaterThanOrEqual(6);
    }
    expect(timelineScale(60, 24, 60, 'frames')).toMatchObject({ major: 1, minor: null });
  });

  it('formats seconds with the locale decimal separator', () => {
    expect(formatSeconds(1.5, 0.5, 'pt-BR')).toBe('1,5s');
    expect(formatSeconds(2, 0.25)).toBe('2s');
    expect(formatSeconds(75, 5)).toBe('1:15');
  });
});

describe('zoom', () => {
  it('never zooms out past the whole timeline nor in past the max', () => {
    expect(fitPxPerFrame(1200, 60)).toBe(20);
    expect(clampZoom(1, 1200, 60)).toBe(20);
    expect(clampZoom(500, 1200, 60)).toBe(60);
    // a timeline shorter than the view at max zoom can only be shown fitted
    expect(clampZoom(500, 1200, 10)).toBe(120);
  });

  it('keeps the frame under the cursor in place', () => {
    const next = scrollForZoom(100, 200, 2, 4); // frame 150 under the cursor
    expect((next + 200) / 4).toBeCloseTo(150);
  });
});
