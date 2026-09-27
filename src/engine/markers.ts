/**
 * Timeline markers (pure): editing, navigation, snapping, and markers found in an audio clip
 * (where sound starts again after a pause: words, phrases, beats).
 */
import type { AudioClip, Marker } from '../types';
import { PEAKS_PER_SECOND } from './audio';

export const MARKER_COLORS = ['#f59e0b', '#22d3ee', '#a78bfa', '#f472b6', '#4ade80'];

export const sortMarkers = (markers: Marker[]) => [...markers].sort((a, b) => a.frame - b.frame);

/** Adds a marker at `frame`; a frame that already has one keeps it (no duplicates). */
export function addMarker(markers: Marker[], frame: number, id: string, label = ''): Marker[] {
  const f = Math.max(1, Math.round(frame));
  if (markers.some((m) => m.frame === f)) return markers;
  const color = MARKER_COLORS[markers.length % MARKER_COLORS.length];
  return sortMarkers([...markers, { id, frame: f, label, color }]);
}

export function updateMarker(markers: Marker[], marker: Marker): Marker[] {
  return sortMarkers(markers.map((m) => (m.id === marker.id ? { ...marker, frame: Math.max(1, Math.round(marker.frame)) } : m)));
}

export const removeMarker = (markers: Marker[], id: string) => markers.filter((m) => m.id !== id);

export const nextMarker = (markers: Marker[], frame: number) => sortMarkers(markers).find((m) => m.frame > frame);
export const prevMarker = (markers: Marker[], frame: number) =>
  sortMarkers(markers)
    .reverse()
    .find((m) => m.frame < frame);

/** The target nearest to `frame` if it is within `threshold` frames, else `frame` unchanged. */
export function snapFrame(frame: number, targets: number[], threshold: number): number {
  let best = frame;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(t - frame);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Snaps a moving span [start, start + length]: whichever edge lands closer to a target wins,
 * and the span keeps its length.
 */
export function snapSpan(start: number, length: number, targets: number[], threshold: number): number {
  const s = snapFrame(start, targets, threshold);
  const e = snapFrame(start + length, targets, threshold);
  const ds = s === start ? Infinity : Math.abs(s - start);
  const de = e === start + length ? Infinity : Math.abs(e - (start + length));
  if (ds === Infinity && de === Infinity) return start;
  return ds <= de ? s : e - length;
}

export interface OnsetOptions {
  /** Silence must last at least this long before a new onset counts (seconds). */
  minGap?: number;
  /** Loudness threshold relative to the loudest peak (0..1). */
  threshold?: number;
}

/**
 * Times (seconds, from the start of the source) where sound starts after a quiet stretch: the
 * start of phrases in a narration, or hits in music. `peaks` is the waveform summary at
 * PEAKS_PER_SECOND.
 */
export function detectOnsets(peaks: Float32Array, opts: OnsetOptions = {}): number[] {
  const minGap = opts.minGap ?? 0.25;
  const loudest = peaks.reduce((m, v) => Math.max(m, v), 0);
  if (loudest <= 0) return [];
  const level = loudest * (opts.threshold ?? 0.2);
  const gapBuckets = Math.max(1, Math.round(minGap * PEAKS_PER_SECOND));
  const onsets: number[] = [];
  let quiet = gapBuckets; // the very start counts as after silence
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] >= level) {
      if (quiet >= gapBuckets) onsets.push(i / PEAKS_PER_SECOND);
      quiet = 0;
    } else {
      quiet++;
    }
  }
  return onsets;
}

/** Onsets of the audible part of a clip, as timeline frames. */
export function clipOnsetFrames(clip: AudioClip, peaks: Float32Array, fps: number, opts?: OnsetOptions): number[] {
  return detectOnsets(peaks, opts)
    .filter((t) => t >= clip.offset - 1e-6 && t < clip.offset + clip.duration)
    .map((t) => Math.round(clip.startFrame + (t - clip.offset) * fps));
}
