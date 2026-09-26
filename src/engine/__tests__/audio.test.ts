import { describe, expect, it } from 'vitest';
import type { AudioClip } from '../../types';
import {
  clipPlayback,
  clipWaveform,
  computePeaks,
  framesToFitAudio,
  moveClip,
  PEAKS_PER_SECOND,
  trimClipEnd,
  trimClipStart,
} from '../audio';

const clip = (over: Partial<AudioClip> = {}): AudioClip => ({
  id: 'a',
  name: 'voz',
  src: 'data:audio/wav;base64,',
  sourceDuration: 10,
  startFrame: 25, // starts at 1 s with 24 fps
  offset: 0,
  duration: 10,
  volume: 1,
  muted: false,
  ...over,
});

describe('clipPlayback', () => {
  it('schedules the whole clip when playback starts before it', () => {
    expect(clipPlayback(clip(), 24, 0)).toEqual({ at: 1, offset: 0, duration: 10 });
  });

  it('starts in the middle of the source when the playhead is inside the clip', () => {
    const p = clipPlayback(clip({ offset: 2 }), 24, 4)!;
    expect(p.at).toBe(0);
    expect(p.offset).toBeCloseTo(5);
    expect(p.duration).toBeCloseTo(7);
  });

  it('is silent after the clip and outside a closed window', () => {
    expect(clipPlayback(clip(), 24, 11)).toBeNull();
    expect(clipPlayback(clip(), 24, 0, 1)).toBeNull();
  });

  it('cuts to the window end (export range, scrub snippet)', () => {
    expect(clipPlayback(clip(), 24, 2, 2.5)).toEqual({ at: 0, offset: 1, duration: 0.5 });
  });
});

describe('trim and move', () => {
  it('trimming the start keeps the remaining sound in place on the timeline', () => {
    const c = clip();
    const t = trimClipStart(c, 12, 24);
    expect(t.startFrame).toBe(37);
    expect(t.offset).toBeCloseTo(0.5);
    expect(t.duration).toBeCloseTo(9.5);
    // Same source time at the same timeline time
    const at = (x: AudioClip) => clipPlayback(x, 24, 3)!.offset;
    expect(at(t)).toBeCloseTo(at(c));
  });

  it('cannot trim before the start of the source or of the timeline', () => {
    expect(trimClipStart(clip({ offset: 0.5 }), -100, 24).offset).toBeCloseTo(0.5 - 12 / 24);
    const early = trimClipStart(clip({ startFrame: 3, offset: 5 }), -100, 24);
    expect(early.startFrame).toBe(1);
    expect(early.offset).toBeCloseTo(5 - 2 / 24);
  });

  it('trimming the end stops at the end of the source and at a minimum length', () => {
    expect(trimClipEnd(clip({ offset: 2, duration: 5 }), 1000, 24).duration).toBeCloseTo(8);
    expect(trimClipEnd(clip(), -1000, 24).duration).toBeCloseTo(0.1);
    expect(trimClipStart(clip(), 1000, 24).duration).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('moves by whole frames and never before frame 1', () => {
    expect(moveClip(clip(), 10.4).startFrame).toBe(10);
    expect(moveClip(clip(), -5).startFrame).toBe(1);
  });

  it('computes the frames needed to fit every clip', () => {
    expect(framesToFitAudio([clip(), clip({ startFrame: 1, duration: 2 })], 24)).toBe(24 + 240);
    expect(framesToFitAudio([], 24)).toBe(0);
  });
});

describe('waveform', () => {
  it('keeps the loudest sample of any channel per bucket', () => {
    const left = new Float32Array([0.1, -0.9, 0.2, 0.3]);
    const right = new Float32Array([0.5, 0, 0, -0.4]);
    expect(Array.from(computePeaks([left, right], 2))).toEqual([
      expect.closeTo(0.9),
      expect.closeTo(0.4),
    ]);
  });

  it('draws only the audible (trimmed) part of the source', () => {
    const peaks = new Float32Array(10 * PEAKS_PER_SECOND);
    peaks.fill(0.2);
    peaks.fill(1, 3 * PEAKS_PER_SECOND, 4 * PEAKS_PER_SECOND);
    const wave = clipWaveform(peaks, clip({ offset: 3, duration: 2 }), 4);
    expect(Array.from(wave)).toEqual([1, 1, expect.closeTo(0.2), expect.closeTo(0.2)]);
  });
});
