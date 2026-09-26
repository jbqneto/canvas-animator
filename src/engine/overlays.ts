/**
 * Charts and texts as animated objects: creation, their box on the stage and the migration from the
 * old "motion tween P1→P2" format (x/y + endX/endY) to keyframes.
 */
import type { Animated, ChartOverlay, IntroEasing, TextOverlay } from '../types';
import type { EasingName, Track, Vec2 } from './keyframes';
import { LocalBox, staticMotion } from './actor';

type Content<T> = Omit<T, keyof Animated> & Pick<Animated, 'startFrame' | 'durationFrames'>;

/** New chart; `center` is where the card's center goes (the anchor for scale and rotation). */
export function createChart(content: Content<ChartOverlay>, center: Vec2): ChartOverlay {
  return { ...content, ...staticMotion(center.x, center.y) };
}

/** New text; `anchor` is the start of its baseline. */
export function createText(content: Content<TextOverlay>, anchor: Vec2): TextOverlay {
  return { ...content, ...staticMotion(anchor.x, anchor.y) };
}

/** The card, centered on the anchor. */
export function chartBox(chart: Pick<ChartOverlay, 'width' | 'height'>): LocalBox {
  return { x: -chart.width / 2, y: -chart.height / 2, width: chart.width, height: chart.height };
}

/** Approximate text box (measuring would need a canvas): the baseline starts at the anchor. */
export function textBox(text: Pick<TextOverlay, 'text' | 'fontSize'>): LocalBox {
  const width = Math.max(160, text.text.length * (text.fontSize * 0.55));
  const height = text.fontSize * 1.5;
  return { x: -8, y: -height + 6, width: width + 16, height: height + 8 };
}

const INTRO_TO_KEY_EASING: Record<IntroEasing, EasingName> = {
  easeOut: 'easeOut',
  easeInOut: 'easeInOut',
  linear: 'linear',
  // The old "bounce" was an elastic overshoot
  bounce: 'elasticOut',
};

/** Legacy fields (projects saved before charts and texts used keyframes). */
interface LegacyMotion {
  x?: number;
  y?: number;
  endX?: number;
  endY?: number;
  hasMotionTween?: boolean;
  easing?: IntroEasing;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Motion of an object read from a file: the current format is kept (with defaults for missing
 * fields); the old one becomes a static position or two position keys (P1 at the start, P2 at the end).
 * `offset` moves the old anchor to the new one (a chart's top-left corner → its center).
 */
function migrateMotion(raw: Partial<Animated> & LegacyMotion, offset: Vec2): Animated {
  const startFrame = Math.max(1, Math.round(num(raw.startFrame, 1)));
  const durationFrames = Math.max(1, Math.round(num(raw.durationFrames, 60)));
  if (raw.base && typeof raw.base === 'object') {
    return {
      startFrame,
      durationFrames,
      base: {
        x: num(raw.base.x, 0),
        y: num(raw.base.y, 0),
        scale: num(raw.base.scale, 1),
        rotation: num(raw.base.rotation, 0),
        opacity: num(raw.base.opacity, 1),
      },
      tracks: raw.tracks && typeof raw.tracks === 'object' ? raw.tracks : {},
      smoothPath: raw.smoothPath ?? true,
      orientToPath: raw.orientToPath ?? false,
      follow: raw.follow,
    };
  }
  const x = num(raw.x, 0) + offset.x;
  const y = num(raw.y, 0) + offset.y;
  const motion: Animated = { startFrame, durationFrames, ...staticMotion(x, y) };
  if (raw.hasMotionTween && raw.endX !== undefined && raw.endY !== undefined) {
    const position: Track<Vec2> = [
      { frame: startFrame, value: { x, y }, easing: INTRO_TO_KEY_EASING[raw.easing ?? 'easeOut'] ?? 'easeOut' },
      { frame: startFrame + durationFrames, value: { x: num(raw.endX, 0) + offset.x, y: num(raw.endY, 0) + offset.y } },
    ];
    motion.tracks = { position };
  }
  return motion;
}

const LEGACY_KEYS = ['x', 'y', 'endX', 'endY', 'hasMotionTween'] as const;
function withoutLegacy<T extends object>(obj: T): T {
  const copy = { ...obj } as Record<string, unknown>;
  LEGACY_KEYS.forEach((k) => delete copy[k]);
  return copy as T;
}

export function migrateChart(raw: any): ChartOverlay {
  const width = num(raw?.width, 480);
  const height = num(raw?.height, 280);
  const motion = migrateMotion(raw ?? {}, { x: width / 2, y: height / 2 });
  return withoutLegacy({ ...raw, width, height, data: Array.isArray(raw?.data) ? raw.data : [], ...motion });
}

export function migrateText(raw: any): TextOverlay {
  const motion = migrateMotion(raw ?? {}, { x: 0, y: 0 });
  return withoutLegacy({ ...raw, text: typeof raw?.text === 'string' ? raw.text : '', ...motion });
}
