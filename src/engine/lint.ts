import type { ActorOverlay, ChartOverlay, TextOverlay } from '../types';
import { sampleActor } from './actor';
import { contrastRatio } from './color';
import { textBox } from './overlays';

export type LintRule = 'text-too-small' | 'text-empty' | 'beyond-timeline' | 'outside-safe-area' | 'low-contrast';

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
  videoBg: { color?: string };
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
}

export function lintScene(input: LintInput, options: LintOptions = {}): LintIssue[] {
  const { minFontPx1080 = 34, minLabelPx1080 = 24, safeMarginRatio = 0.05, minContrast = 4.5 } = options;
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
    const ratio = contrastRatio(txt.color || '#ffffff', txt.bgColor ?? input.videoBg.color ?? '');
    if (ratio !== null && ratio < minContrast) {
      issues.push({ rule: 'low-contrast', severity: 'warning', objectId: txt.id, message: `Contrast ${ratio.toFixed(1)}:1 is below ${minContrast}:1.` });
    }
  }
  return issues;
}
