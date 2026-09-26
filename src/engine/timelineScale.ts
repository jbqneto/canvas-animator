/**
 * Timeline ruler/grid scale (pure): where to draw lines and labels for a given zoom, in frames or in
 * seconds. Everything is expressed in frames and as fractions of the timeline width, so the view can
 * draw it with CSS at any length.
 */

export type TimeUnit = 'seconds' | 'frames';

/** Closest zoom (pixels per frame) allowed: a frame never gets wider than this. */
export const MAX_PX_PER_FRAME = 60;
/** Labels closer than this would overlap. */
const MIN_LABEL_PX = 56;
/** Lines closer than this are noise. */
const MIN_LINE_PX = 6;

const FRAME_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const SECOND_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

export interface RulerLabel {
  /** Position as a fraction of the timeline width (0..1). */
  x: number;
  text: string;
}

export interface TimelineScale {
  /** Frames between strong (labelled) lines. */
  major: number;
  /** Frames between faint lines, or null when they would be too dense. */
  minor: number | null;
  labels: RulerLabel[];
}

/** Steps (in whole frames) available for the unit, smallest first. */
function stepsInFrames(unit: TimeUnit, fps: number): number[] {
  if (unit === 'frames') return FRAME_STEPS;
  const fromSeconds = SECOND_STEPS.map((s) => s * fps).filter((f) => f >= 1 && Math.abs(f - Math.round(f)) < 1e-9);
  // Zoomed in past the nicest small time step, single frames are still meaningful
  return [...new Set([1, ...fromSeconds.map(Math.round)])].sort((a, b) => a - b);
}

/** Time label: "0.25s", "1.5s", "12s", "1:05" (the decimal separator follows the locale). */
export function formatSeconds(seconds: number, step: number, locale = 'en-US'): string {
  if (seconds >= 60 || step >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds - m * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${seconds.toLocaleString(locale, { maximumFractionDigits: step >= 1 ? 0 : 2 })}s`;
}

/** Label of a mark in seconds mode; single-frame steps read "1s" on the second and "5f" between. */
function secondsLabel(frame: number, fps: number, step: number, locale?: string): string {
  const isNiceTime = Math.abs((step / fps) * 100 - Math.round((step / fps) * 100)) < 1e-9;
  if (isNiceTime) return formatSeconds(frame / fps, step / fps, locale);
  const within = Math.round(frame % fps);
  return within === 0 ? formatSeconds(frame / fps, 1, locale) : `${within}f`;
}

export function timelineScale(
  totalFrames: number,
  fps: number,
  pxPerFrame: number,
  unit: TimeUnit,
  locale?: string
): TimelineScale {
  const steps = stepsInFrames(unit, fps);
  const major = steps.find((s) => s * pxPerFrame >= MIN_LABEL_PX) ?? steps[steps.length - 1];
  const minor = steps.find((s) => s < major && major % s === 0 && s * pxPerFrame >= MIN_LINE_PX) ?? null;

  const labels: RulerLabel[] = [];
  if (unit === 'frames') {
    // Flash numbers the frame cells: label N sits at the start of frame N
    labels.push({ x: 0, text: '1' });
    for (let f = major; f <= totalFrames; f += major) labels.push({ x: (f - 1) / totalFrames, text: String(f) });
  } else {
    // Time marks sit on the boundary where that time starts (0s = start of frame 1)
    for (let f = 0; f < totalFrames; f += major) {
      labels.push({ x: f / totalFrames, text: secondsLabel(f, fps, major, locale) });
    }
  }
  return { major, minor, labels };
}

/** Pixels per frame that fit the whole timeline in `width`. */
export const fitPxPerFrame = (width: number, totalFrames: number) => Math.max(1e-3, width / Math.max(1, totalFrames));

/** Zoom kept between "whole timeline visible" and MAX_PX_PER_FRAME. */
export function clampZoom(pxPerFrame: number, width: number, totalFrames: number): number {
  const fit = fitPxPerFrame(width, totalFrames);
  return Math.min(Math.max(fit, MAX_PX_PER_FRAME), Math.max(fit, pxPerFrame));
}

/**
 * Scroll offset that keeps the frame under the cursor in place when zooming (like any editor's
 * Ctrl+wheel). `cursorX` is relative to the visible area.
 */
export function scrollForZoom(scrollLeft: number, cursorX: number, oldPx: number, newPx: number): number {
  const framesFromStart = (scrollLeft + cursorX) / oldPx;
  return Math.max(0, framesFromStart * newPx - cursorX);
}
