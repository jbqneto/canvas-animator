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
        role: 'caption',
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

// ================= SUBTITLE FILES (.srt / .vtt) =================

/** "01:02:03,450", "02:03.450" (VTT without hours) or with "." → seconds; NaN when not a time. */
function parseTime(raw: string): number {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  const [, h, min, s, ms] = m;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}

/** Frame where a time lands (frame 1 = 0 s). */
const secondsToFrame = (seconds: number, fps: number) => 1 + Math.round(seconds * fps);

/**
 * Cues of an SRT or WebVTT file, in file time (0 s = frame 1). Numbers, VTT headers/notes, styling
 * tags (<i>, <c.x>, {\an8}) and cue settings are dropped; multi-line cues become one line.
 */
export function parseSubtitles(text: string, fps: number): CaptionSpan[] {
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const spans: CaptionSpan[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [startRaw, rest] = lines[timing].split('-->');
    // VTT cue settings ("align:start position:10%") follow the end time
    const start = parseTime(startRaw);
    const end = parseTime((rest ?? '').trim().split(/\s+/)[0] ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const cue = lines
      .slice(timing + 1)
      .map((l) => l.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim())
      .filter(Boolean)
      .join(' ');
    if (!cue) continue;
    const startFrame = secondsToFrame(start, fps);
    spans.push({ text: cue, startFrame, endFrame: Math.max(startFrame + 1, secondsToFrame(end, fps)) });
  }
  return spans.sort((a, b) => a.startFrame - b.startFrame);
}

function srtTime(frame: number, fps: number): string {
  const ms = Math.max(0, Math.round(((frame - 1) / fps) * 1000));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** SRT file for the spans (end = first frame after the caption). */
export function toSrt(spans: CaptionSpan[], fps: number): string {
  return spans
    .map((s, i) => `${i + 1}\n${srtTime(s.startFrame, fps)} --> ${srtTime(s.endFrame, fps)}\n${s.text}\n`)
    .join('\n');
}

/** The project's captions (texts made by the captions dialog) back as spans, in time order. */
export function captionSpansOf(texts: TextOverlay[]): CaptionSpan[] {
  return texts
    .filter((x) => x.role === 'caption')
    .map((x) => ({ text: x.text, startFrame: x.startFrame, endFrame: x.startFrame + x.durationFrames + 1 }))
    .sort((a, b) => a.startFrame - b.startFrame);
}
