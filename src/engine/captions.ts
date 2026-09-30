/**
 * Captions from a narration script: one line per caption, timed by the timeline markers (a marker per
 * phrase, placed by hand or from the audio's pauses). Lines without a marker share the remaining time
 * in proportion to their length, so longer phrases stay longer on screen.
 */
import type { TextOverlay } from '../types';
import { createText } from './overlays';

export interface CaptionSpan {
  text: string;
  startFrame: number;
  /** First frame after the caption (the next one starts here). */
  endFrame: number;
}

const READ_CHARS_PER_SECOND = 15;
const MIN_LINE_SECONDS = 1.2;
const MIN_LINE_CHARS = READ_CHARS_PER_SECOND * MIN_LINE_SECONDS;

/** Script lines, trimmed, blank lines dropped. */
export const scriptLines = (script: string) =>
  script
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Times each line: line i starts at the i-th marker from `from` on; lines past the last marker split
 * what is left until `to` by length. Every caption ends where the next begins; the last one ends at the
 * next unused marker, or at `to`.
 */
export function captionSpans(lines: string[], markerFrames: number[], from: number, to: number): CaptionSpan[] {
  if (lines.length === 0 || to <= from) return [];
  const cues = [...new Set(markerFrames.filter((f) => f >= from && f < to))].sort((a, b) => a - b);
  const starts: number[] = [];
  const timed = Math.min(lines.length, cues.length);
  for (let i = 0; i < timed; i++) starts.push(cues[i]);

  // Lines without a marker of their own share the time after the last timed start (or from `from`)
  if (timed < lines.length) {
    const firstFree = timed === 0 ? 0 : timed - 1;
    const segStart = timed === 0 ? from : starts[timed - 1];
    // Same floor as the reading time (1.2 s ≈ 18 characters), so a one-word line doesn't flash by
    const weights = lines.slice(firstFree).map((l) => Math.max(MIN_LINE_CHARS, l.length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    weights.forEach((w, k) => {
      const frame = Math.round(segStart + ((to - segStart) * acc) / total);
      if (k === 0 && timed > 0) {
        acc += w;
        return; // the last timed line keeps its marker
      }
      starts.push(frame);
      acc += w;
    });
  }

  const lastEnd = cues[lines.length] ?? to;
  return lines.map((text, i) => {
    const startFrame = Math.max(from, starts[i]);
    const next = i + 1 < lines.length ? starts[i + 1] : lastEnd;
    return { text, startFrame, endFrame: Math.max(startFrame + 1, next) };
  });
}

export interface CaptionStyle {
  width: number;
  height: number;
  position: 'bottom' | 'top';
  fontSize: number;
  idPrefix: string;
}

/** One centered text per span, with a dark box so it reads over any video. */
export function captionTexts(spans: CaptionSpan[], style: CaptionStyle): TextOverlay[] {
  const y = Math.round(style.position === 'bottom' ? style.height * 0.88 : style.height * 0.12 + style.fontSize);
  return spans.map((span, i) =>
    createText(
      {
        id: `${style.idPrefix}-${i}`,
        text: span.text,
        fontSize: style.fontSize,
        color: '#ffffff',
        bgColor: 'rgba(0,0,0,0.55)',
        align: 'center',
        effect: 'fadeRise',
        visible: true,
        startFrame: span.startFrame,
        // The span of an object includes its last frame, so it ends right before the next caption
        durationFrames: Math.max(0, span.endFrame - span.startFrame - 1),
      },
      { x: Math.round(style.width / 2), y }
    )
  );
}

/** Comfortable reading time for the lines (~15 characters per second, at least 1.2 s each), in frames. */
export function readingFrames(lines: string[], fps: number): number {
  const seconds = lines.reduce((sum, l) => sum + Math.max(MIN_LINE_SECONDS, l.length / READ_CHARS_PER_SECOND), 0);
  return Math.ceil(seconds * fps);
}
