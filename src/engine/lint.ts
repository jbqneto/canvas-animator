import type { ActorOverlay, ChartOverlay, TextOverlay } from '../types';
import { sampleActor } from './actor';
import { isUsableMaskShape, isValidMaskMode } from './mask';
import { contrastRatio } from './color';
import { sampleEffects } from './effects';
import { textBox } from './overlays';

export type LintRule = 'text-too-small' | 'text-empty' | 'beyond-timeline' | 'outside-safe-area' | 'low-contrast' | 'blurred-text' | 'dead-air' | 'uniform-entrance' | 'mask-missing' | 'mask-span';

export interface LintIssue {
  rule: LintRule;
  severity: 'error' | 'warning';
  objectId?: string;
  message: string;
}

/** The part of a project the checks read: the shape of get_project().file.project. */
export interface LintInput {
  fps: number;
  totalFrames: number;
  canvas: { width: number; height: number };
  videoBg: { type?: string; color?: string };
  content: { texts?: TextOverlay[]; actors?: ActorOverlay[]; charts?: ChartOverlay[] };
}

export interface LintOptions {
  /** Smallest readable text at 1080p (scaled with the canvas height). */
  minFontPx1080?: number;
  /** Smallest readable size (at 1080p) for spaced uppercase labels, which read larger than body text. */
  minLabelPx1080?: number;
  /** Margin kept free on every side, as a fraction of the canvas. */
  safeMarginRatio?: number;
  minContrast?: number;
  /** Longest stretch (seconds) with nothing on screen over a plain background. */
  maxDeadAirSec?: number;
  /** How many texts must share one entrance effect before it is flagged as the default look. */
  uniformEntranceMin?: number;
}

/** Smallest blur over the object's span (sampled; about 60 points), so an entrance that clears to 0 is fine. */
function minBlur(obj: TextOverlay): number {
  const last = obj.startFrame + obj.durationFrames - 1;
  const step = Math.max(1, Math.ceil(obj.durationFrames / 60));
  let lowest = Infinity;
  for (let f = obj.startFrame; f <= last; f += step) lowest = Math.min(lowest, sampleEffects(obj, f).blur);
  return Math.min(lowest, sampleEffects(obj, last).blur);
}

export function lintScene(input: LintInput, options: LintOptions = {}): LintIssue[] {
  const { minFontPx1080 = 34, minLabelPx1080 = 24, safeMarginRatio = 0.05, minContrast = 4.5, maxDeadAirSec = 3, uniformEntranceMin = 4 } = options;
  const { width, height } = input.canvas;
  const texts = input.content.texts ?? [];
  const issues: LintIssue[] = [];

  const timed = [...texts, ...(input.content.actors ?? []), ...(input.content.charts ?? [])];
  for (const obj of timed) {
    if (obj.startFrame > input.totalFrames) {
      issues.push({ rule: 'beyond-timeline', severity: 'error', objectId: obj.id, message: `Starts at frame ${obj.startFrame}, after the end of the timeline (${input.totalFrames}).` });
    } else if (obj.startFrame + obj.durationFrames - 1 > input.totalFrames) {
      issues.push({ rule: 'beyond-timeline', severity: 'warning', objectId: obj.id, message: `Runs to frame ${obj.startFrame + obj.durationFrames - 1}, past the end of the timeline (${input.totalFrames}).` });
    }
  }

  const scale = height / 1080;
  const isLabel = (txt: TextOverlay) => (txt.letterSpacing ?? 0) > 0 && /[A-Z]/.test(txt.text) && txt.text === txt.text.toUpperCase();
  const mx = width * safeMarginRatio;
  const my = height * safeMarginRatio;
  for (const txt of texts) {
    if (!txt.text.trim() && !txt.isNumberCounter && txt.effect !== 'numberRoll') {
      issues.push({ rule: 'text-empty', severity: 'warning', objectId: txt.id, message: 'Text is empty.' });
      continue;
    }
    const minFont = ((isLabel(txt) ? minLabelPx1080 : minFontPx1080) * scale);
    if (txt.fontSize < minFont) {
      issues.push({ rule: 'text-too-small', severity: 'warning', objectId: txt.id, message: `Font ${txt.fontSize}px is below ${Math.round(minFont)}px for a ${height}p canvas.` });
    }
    const state = sampleActor(txt, Math.round(txt.startFrame + txt.durationFrames / 2));
    const box = textBox(txt);
    const left = state.x + box.x * state.scale;
    const right = state.x + (box.x + box.width) * state.scale;
    const top = state.y + box.y * state.scale;
    const bottom = state.y + (box.y + box.height) * state.scale;
    if (left < mx || right > width - mx || top < my || bottom > height - my) {
      issues.push({ rule: 'outside-safe-area', severity: 'warning', objectId: txt.id, message: `Text box (${Math.round(left)},${Math.round(top)})–(${Math.round(right)},${Math.round(bottom)}) leaves the ${Math.round(safeMarginRatio * 100)}% safe area.` });
    }
    if (minBlur(txt) >= 2) {
      issues.push({ rule: 'blurred-text', severity: 'warning', objectId: txt.id, message: 'Text stays blurred for its whole duration; animate blur to 0 or turn it off.' });
    }
    const ratio = contrastRatio(txt.color || '#ffffff', txt.bgColor ?? input.videoBg.color ?? '');
    if (ratio !== null && ratio < minContrast) {
      issues.push({ rule: 'low-contrast', severity: 'warning', objectId: txt.id, message: `Contrast ${ratio.toFixed(1)}:1 is below ${minContrast}:1.` });
    }
  }
  issues.push(...maskIssues(timed, input.content.actors ?? []));
  // Mask-only actors are never drawn, so they do not fill the screen
  const visibleTimed = timed.filter((o) => !('maskOnly' in o && o.maskOnly));
  issues.push(...deadAir(input, visibleTimed, maxDeadAirSec), ...uniformEntrance(texts, uniformEntranceMin));
  return issues;
}

/** Gaps with nothing on screen. Skipped over a video background, which fills the frame by itself. */
function deadAir(input: LintInput, timed: { startFrame: number; durationFrames: number }[], maxSec: number): LintIssue[] {
  if (input.videoBg.type === 'upload' || input.videoBg.type === 'preset' || timed.length === 0) return [];
  const spans = timed
    .map((o) => [Math.max(1, o.startFrame), Math.min(input.totalFrames, o.startFrame + o.durationFrames - 1)] as const)
    .filter(([from, to]) => to >= from)
    .sort((a, b) => a[0] - b[0]);
  const issues: LintIssue[] = [];
  let covered = 0;
  const report = (from: number, to: number) => {
    const sec = (to - from + 1) / input.fps;
    if (sec > maxSec) {
      issues.push({ rule: 'dead-air', severity: 'warning', message: `Nothing on screen from ${((from - 1) / input.fps).toFixed(1)}s to ${(to / input.fps).toFixed(1)}s (${sec.toFixed(1)}s).` });
    }
  };
  for (const [from, to] of spans) {
    if (from > covered + 1) report(covered + 1, from - 1);
    covered = Math.max(covered, to);
  }
  if (covered < input.totalFrames) report(covered + 1, input.totalFrames);
  return issues;
}

/** Many texts entering the same way read as the template default; vary the entrance. */
function uniformEntrance(texts: TextOverlay[], min: number): LintIssue[] {
  const counts = new Map<string, number>();
  for (const t of texts) counts.set(t.effect, (counts.get(t.effect) ?? 0) + 1);
  const issues: LintIssue[] = [];
  for (const [effect, n] of counts) {
    if (n >= min && n === texts.length) {
      issues.push({ rule: 'uniform-entrance', severity: 'warning', message: `All ${n} texts use the "${effect}" entrance; vary the entrance, easing or emphasis per object.` });
    }
  }
  return issues;
}

/** Masks that cannot cut (missing or unusable shape) and masks that stop before the object does. */
function maskIssues(timed: (TextOverlay | ActorOverlay | ChartOverlay)[], actors: ActorOverlay[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const obj of timed) {
    const ref = obj.mask;
    if (!ref) continue;
    const shape = actors.find((a) => a.id === ref.actorId);
    if (ref.actorId === obj.id || !isUsableMaskShape(shape) || !isValidMaskMode(ref.mode)) {
      issues.push({ rule: 'mask-missing', severity: 'error', objectId: obj.id, message: `Mask "${ref.actorId}" is missing, is not a rectangle, ellipse or arrow shape actor, or has an invalid mode; the object is drawn whole.` });
      continue;
    }
    if (shape.startFrame > obj.startFrame || shape.startFrame + shape.durationFrames < obj.startFrame + obj.durationFrames) {
      issues.push({ rule: 'mask-span', severity: 'warning', objectId: obj.id, message: `Mask "${ref.actorId}" (frames ${shape.startFrame}–${shape.startFrame + shape.durationFrames}) does not cover the whole span of the object (${obj.startFrame}–${obj.startFrame + obj.durationFrames}); outside it the object is drawn whole.` });
    }
  }
  return issues;
}
