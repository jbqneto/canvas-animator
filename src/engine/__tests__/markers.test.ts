import { describe, expect, it } from 'vitest';
import type { AudioClip } from '../../types';
import { PEAKS_PER_SECOND } from '../audio';
import {
  addMarker,
  clipOnsetFrames,
  detectOnsets,
  nextMarker,
  prevMarker,
  removeMarker,
  snapFrame,
  snapSpan,
  updateMarker,
} from '../markers';

describe('markers', () => {
  it('adds sorted markers without duplicating a frame', () => {
    let m = addMarker([], 30, 'a');
    m = addMarker(m, 10.4, 'b', 'início');
    m = addMarker(m, 30, 'c');
    expect(m.map((x) => [x.id, x.frame])).toEqual([
      ['b', 10],
      ['a', 30],
    ]);
    expect(m[0].label).toBe('início');
    expect(m[0].color).not.toBe(m[1].color);
  });

  it('moves, removes and navigates', () => {
    let m = addMarker(addMarker([], 10, 'a'), 30, 'b');
    m = updateMarker(m, { ...m[0], frame: 50 });
    expect(m.map((x) => x.frame)).toEqual([30, 50]);
    expect(nextMarker(m, 30)?.frame).toBe(50);
    expect(prevMarker(m, 30)).toBeUndefined();
    expect(removeMarker(m, 'b').map((x) => x.id)).toEqual(['a']);
  });
});

describe('snapping', () => {
  it('snaps to the nearest target within the threshold only', () => {
    expect(snapFrame(52, [10, 50, 55], 3)).toBe(50);
    expect(snapFrame(53, [10, 50, 55], 3)).toBe(55);
    expect(snapFrame(40, [10, 50], 3)).toBe(40);
  });

  it('snaps a moving span by whichever edge is closer, keeping its length', () => {
    expect(snapSpan(49, 20, [50], 3)).toBe(50); // start edge
    expect(snapSpan(31, 20, [50], 3)).toBe(30); // end edge lands on 50
    expect(snapSpan(10, 20, [50], 3)).toBe(10);
  });
});

describe('audio onsets', () => {
  const peaks = () => {
    const p = new Float32Array(4 * PEAKS_PER_SECOND);
    // sound at 0.5–1.0 s, a short dip at 0.7 s (not a new phrase), then again at 2.0–2.5 s
    p.fill(0.8, 0.5 * PEAKS_PER_SECOND, 1.0 * PEAKS_PER_SECOND);
    p[0.7 * PEAKS_PER_SECOND] = 0;
    p.fill(0.6, 2.0 * PEAKS_PER_SECOND, 2.5 * PEAKS_PER_SECOND);
    return p;
  };

  it('finds where sound starts after a pause', () => {
    expect(detectOnsets(peaks())).toEqual([0.5, 2]);
    expect(detectOnsets(new Float32Array(100))).toEqual([]);
  });

  it('maps onsets of the audible part of a clip to timeline frames', () => {
    const clip: AudioClip = {
      id: 'a', name: 'voz', src: 'data:', sourceDuration: 4, startFrame: 25, offset: 1, duration: 3, volume: 1, muted: false,
    };
    // the onset at 0.5 s is trimmed away; 2.0 s in the source = 1 s after the clip start
    expect(clipOnsetFrames(clip, peaks(), 24)).toEqual([49]);
  });
});
