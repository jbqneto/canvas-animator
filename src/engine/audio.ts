/**
 * Audio clips on the timeline (pure functions, no Web Audio).
 *
 * A clip plays the source from `offset` for `duration` seconds, starting at `startFrame`. Every
 * consumer (live playback, scrubbing, export mix) asks the same question, "which part of the clip is
 * audible between timeline times A and B?", so they all agree on timing.
 */
import type { AudioClip } from '../types';

/** Shortest clip a trim can leave, in seconds. */
export const MIN_CLIP_SECONDS = 0.1;

/** Timeline time (seconds) where a frame starts. Frames start at 1. */
export const frameTime = (frame: number, fps: number) => (frame - 1) / fps;

/** Timeline time (seconds) where the clip starts. */
export const clipStartTime = (clip: AudioClip, fps: number) => frameTime(clip.startFrame, fps);

/** Span of the clip in (fractional) frames. */
export const clipDurationFrames = (clip: AudioClip, fps: number) => clip.duration * fps;

/** Frames the timeline needs so that every clip fits. */
export function framesToFitAudio(clips: AudioClip[], fps: number): number {
  return clips.reduce((max, c) => Math.max(max, Math.ceil(c.startFrame - 1 + clipDurationFrames(c, fps))), 0);
}

export interface ClipPlayback {
  /** Seconds after `from` when the sound starts. */
  at: number;
  /** Position in the source file where it starts. */
  offset: number;
  /** Seconds to play. */
  duration: number;
}

/**
 * Part of the clip audible in the timeline window [from, to) (seconds), or null if silent there.
 * `to` may be Infinity (play until the clip ends).
 */
export function clipPlayback(clip: AudioClip, fps: number, from: number, to = Infinity): ClipPlayback | null {
  const start = clipStartTime(clip, fps);
  const end = start + clip.duration;
  const a = Math.max(from, start);
  const b = Math.min(to, end);
  if (b - a <= 1e-6) return null;
  return { at: a - from, offset: clip.offset + (a - start), duration: b - a };
}

export function moveClip(clip: AudioClip, startFrame: number): AudioClip {
  return { ...clip, startFrame: Math.max(1, Math.round(startFrame)) };
}

/**
 * Moves the start edge by whole frames and keeps the rest of the sound where it was on the timeline
 * (like trimming a clip in any editor). Stops at the start of the source and of the timeline.
 */
export function trimClipStart(clip: AudioClip, deltaFrames: number, fps: number): AudioClip {
  const minDelta = Math.max(-Math.floor(clip.offset * fps + 1e-6), 1 - clip.startFrame);
  const maxDelta = Math.floor((clip.duration - MIN_CLIP_SECONDS) * fps);
  const d = Math.round(Math.max(minDelta, Math.min(maxDelta, deltaFrames)));
  return {
    ...clip,
    startFrame: clip.startFrame + d,
    offset: clip.offset + d / fps,
    duration: clip.duration - d / fps,
  };
}

/** Moves the end edge by whole frames, up to the end of the source. */
export function trimClipEnd(clip: AudioClip, deltaFrames: number, fps: number): AudioClip {
  const available = clip.sourceDuration - clip.offset;
  const duration = Math.max(MIN_CLIP_SECONDS, Math.min(available, clip.duration + deltaFrames / fps));
  return { ...clip, duration };
}

/** Peaks stored per second of audio for the waveform (enough for a frame-level view at 60 fps). */
export const PEAKS_PER_SECOND = 100;

/**
 * Waveform summary: loudest absolute sample of any channel in each of `buckets` equal slices.
 */
export function computePeaks(channels: Float32Array[], buckets: number): Float32Array {
  const peaks = new Float32Array(Math.max(0, buckets));
  const length = channels[0]?.length ?? 0;
  if (length === 0 || buckets <= 0) return peaks;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * length) / buckets);
    const to = Math.max(from + 1, Math.floor(((b + 1) * length) / buckets));
    let max = 0;
    for (const data of channels) {
      for (let i = from; i < to && i < length; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
    }
    peaks[b] = max;
  }
  return peaks;
}

/**
 * Peaks of the audible part of a clip resampled to `columns` values (one per drawn pixel column).
 * `peaks` covers the whole source at PEAKS_PER_SECOND.
 */
export function clipWaveform(peaks: Float32Array, clip: AudioClip, columns: number): Float32Array {
  const out = new Float32Array(Math.max(0, Math.floor(columns)));
  if (out.length === 0 || peaks.length === 0) return out;
  const first = clip.offset * PEAKS_PER_SECOND;
  const span = clip.duration * PEAKS_PER_SECOND;
  for (let c = 0; c < out.length; c++) {
    const a = Math.floor(first + (c * span) / out.length);
    const b = Math.max(a + 1, Math.floor(first + ((c + 1) * span) / out.length));
    let max = 0;
    for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > max) max = peaks[i];
    out[c] = max;
  }
  return out;
}
