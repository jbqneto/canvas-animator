/**
 * Built-in templates: common video-enrichment pieces assembled from generic objects (texts, charts,
 * shape images) plus motion presets. Positions and sizes are fractions of the canvas, so they work
 * for any format (16:9, 9:16, square).
 */
import type { ChartOverlay, ChartType, TextOverlay } from '../types';
import { createChart, createText } from '../engine/overlays';
import { applyEntrance, applyExit, MotionPreset } from '../engine/motionPresets';
import { setKeyframe, Track } from '../engine/keyframes';
import { parseLocaleNumber } from '../utils/motionUtils';
import { createShapeActor, defaultShapeStyle } from '../engine/shapes';
import { AnimationTemplate, emptyOutput, TemplateContext, TemplateValues } from './types';

const str = (v: string | number | undefined) => String(v ?? '');
const num = (v: string | number | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Approximate width of bold text (the renderer draws 800-weight sans-serif). */
const textWidth = (text: string, fontSize: number) => text.length * fontSize * 0.58;

/** Span in frames of `seconds`, starting at the template start. */
const spanOf = (ctx: TemplateContext, seconds: number) => Math.max(ctx.fps, Math.round(seconds * ctx.fps));

const secondsParam = (def: number) =>
  ({ key: 'seconds', type: 'number', labelKey: 'templates.param.seconds', default: def, min: 1, max: 60, step: 0.5 }) as const;

const colorParam = (def: string) => ({ key: 'color', type: 'color', labelKey: 'templates.param.color', default: def }) as const;

/** Entrance + exit with template-friendly lengths (entrance ~0.6 s, exit ~0.4 s). */
function enterExit<T extends Parameters<typeof applyEntrance>[0]>(
  obj: T,
  ctx: TemplateContext,
  enter: MotionPreset,
  exit: MotionPreset,
  distance: number
): T {
  const withIn = applyEntrance(obj, enter, { frames: Math.round(ctx.fps * 0.6), distance });
  return applyExit(withIn, exit, { frames: Math.round(ctx.fps * 0.4), distance });
}

const baseText = (id: string, text: string, fontSize: number, color: string, startFrame: number, durationFrames: number) =>
  // No built-in intro: the entrance comes from the motion presets (keyframes)
  ({ id, text, fontSize, color, effect: 'none' as const, visible: true, startFrame, durationFrames });

// ================= TITLE =================
const title: AnimationTemplate = {
  id: 'title',
  category: 'titles',
  nameKey: 'templates.title.name',
  descriptionKey: 'templates.title.description',
  params: [
    { key: 'title', type: 'text', labelKey: 'templates.param.title', defaultKey: 'templates.title.defaultTitle' },
    { key: 'subtitle', type: 'text', labelKey: 'templates.param.subtitle', defaultKey: 'templates.title.defaultSubtitle' },
    {
      key: 'entrance',
      type: 'select',
      labelKey: 'templates.param.entrance',
      default: 'slideUp',
      options: [
        { value: 'slideUp', labelKey: 'motionPreset.slideUp' },
        { value: 'fade', labelKey: 'motionPreset.fade' },
        { value: 'pop', labelKey: 'motionPreset.pop' },
      ],
    },
    colorParam('#ffffff'),
    secondsParam(4),
  ],
  build(values, ctx) {
    const fontSize = Math.round(Math.min(ctx.width, ctx.height * 1.8) / 16);
    const text = str(values.title);
    const span = spanOf(ctx, num(values.seconds, 4));
    let t = createText(
      { ...baseText(`${ctx.idPrefix}-title`, text, fontSize, str(values.color), ctx.startFrame, span), subtitle: str(values.subtitle) || undefined },
      { x: Math.round(ctx.width / 2 - textWidth(text, fontSize) / 2), y: Math.round(ctx.height * 0.46) }
    );
    t = enterExit(t, ctx, str(values.entrance) as MotionPreset, 'fade', ctx.height * 0.08);
    return { ...emptyOutput(), texts: [t], endFrame: ctx.startFrame + span };
  },
};

// ================= LOWER THIRD =================
const lowerThird: AnimationTemplate = {
  id: 'lowerThird',
  category: 'titles',
  nameKey: 'templates.lowerThird.name',
  descriptionKey: 'templates.lowerThird.description',
  params: [
    { key: 'name', type: 'text', labelKey: 'templates.param.name', defaultKey: 'templates.lowerThird.defaultName' },
    { key: 'role', type: 'text', labelKey: 'templates.param.role', defaultKey: 'templates.lowerThird.defaultRole' },
    colorParam('#0ea5e9'),
    secondsParam(5),
  ],
  build(values, ctx) {
    const span = spanOf(ctx, num(values.seconds, 5));
    const barW = Math.round(Math.max(ctx.width * 0.34, 260));
    const barH = Math.round(ctx.height * 0.13);
    const left = Math.round(ctx.width * 0.05);
    const centerY = Math.round(ctx.height * 0.8);
    const nameSize = Math.round(barH * 0.34);
    const roleSize = Math.round(barH * 0.2);
    const delay = Math.round(ctx.fps * 0.2);

    const bar = enterExit(
      createShapeActor({
        id: `${ctx.idPrefix}-bar`,
        name: str(values.name),
        style: { ...defaultShapeStyle('rect', str(values.color)), radius: Math.round(barH * 0.18) },
        width: barW,
        height: barH,
        x: left + barW / 2,
        y: centerY,
        startFrame: ctx.startFrame,
        durationFrames: span,
      }),
      ctx,
      'slideRight',
      'slideLeft',
      barW * 0.6
    );
    const textLeft = left + Math.round(barH * 0.28);
    const name = enterExit(
      createText(
        baseText(`${ctx.idPrefix}-name`, str(values.name), nameSize, '#ffffff', ctx.startFrame + delay, span - delay),
        { x: textLeft, y: Math.round(centerY - barH * 0.02) }
      ),
      ctx,
      'slideRight',
      'fade',
      barW * 0.15
    );
    const role = enterExit(
      createText(
        baseText(`${ctx.idPrefix}-role`, str(values.role), roleSize, '#e0f2fe', ctx.startFrame + 2 * delay, span - 2 * delay),
        { x: textLeft, y: Math.round(centerY + barH * 0.3) }
      ),
      ctx,
      'fade',
      'fade',
      0
    );
    return { ...emptyOutput(), actors: [bar], texts: [name, role], endFrame: ctx.startFrame + span };
  },
};

// ================= BIG NUMBER =================
const bigNumber: AnimationTemplate = {
  id: 'bigNumber',
  category: 'data',
  nameKey: 'templates.bigNumber.name',
  descriptionKey: 'templates.bigNumber.description',
  params: [
    { key: 'from', type: 'number', labelKey: 'templates.param.from', default: 0, min: -1e12, max: 1e12, step: 1 },
    { key: 'to', type: 'number', labelKey: 'templates.param.to', default: 1250, min: -1e12, max: 1e12, step: 1 },
    { key: 'decimals', type: 'number', labelKey: 'templates.param.decimals', default: 0, min: 0, max: 3, step: 1 },
    { key: 'prefix', type: 'text', labelKey: 'templates.param.prefix', defaultKey: 'templates.bigNumber.defaultPrefix' },
    { key: 'suffix', type: 'text', labelKey: 'templates.param.suffix', defaultKey: 'templates.bigNumber.defaultSuffix' },
    { key: 'label', type: 'text', labelKey: 'templates.param.label', defaultKey: 'templates.bigNumber.defaultLabel' },
    colorParam('#38bdf8'),
    secondsParam(4),
  ],
  build(values, ctx) {
    const span = spanOf(ctx, num(values.seconds, 4));
    const size = Math.round(Math.min(ctx.width, ctx.height * 1.8) / 9);
    const to = num(values.to, 0);
    const sample = `${str(values.prefix)}${Math.round(to).toLocaleString('pt-BR')}${str(values.suffix)}`;
    const cy = Math.round(ctx.height * 0.5);
    const counter: TextOverlay = enterExit(
      createText(
        {
          ...baseText(`${ctx.idPrefix}-number`, sample, size, str(values.color), ctx.startFrame, span),
          effect: 'numberRoll',
          isNumberCounter: true,
          counterStart: num(values.from, 0),
          counterEnd: to,
          counterDecimals: Math.max(0, Math.round(num(values.decimals, 0))),
          counterPrefix: str(values.prefix),
          counterSuffix: str(values.suffix),
          animDurationFrames: Math.round(span * 0.55),
          easing: 'easeOut',
        },
        { x: Math.round(ctx.width / 2 - textWidth(sample, size) / 2), y: cy }
      ),
      ctx,
      'pop',
      'fade',
      0
    );
    const labelSize = Math.round(size * 0.3);
    const labelText = str(values.label);
    const delay = Math.round(ctx.fps * 0.4);
    const label = enterExit(
      createText(baseText(`${ctx.idPrefix}-label`, labelText, labelSize, '#e2e8f0', ctx.startFrame + delay, span - delay), {
        x: Math.round(ctx.width / 2 - textWidth(labelText, labelSize) / 2),
        y: Math.round(cy + size * 0.75),
      }),
      ctx,
      'slideUp',
      'fade',
      ctx.height * 0.04
    );
    return { ...emptyOutput(), texts: [counter, label], endFrame: ctx.startFrame + span };
  },
};

// ================= BULLET LIST =================
const bulletList: AnimationTemplate = {
  id: 'bulletList',
  category: 'titles',
  nameKey: 'templates.bulletList.name',
  descriptionKey: 'templates.bulletList.description',
  params: [
    { key: 'items', type: 'lines', labelKey: 'templates.param.items', defaultKey: 'templates.bulletList.defaultItems' },
    { key: 'stagger', type: 'number', labelKey: 'templates.param.stagger', default: 0.6, min: 0.1, max: 5, step: 0.1 },
    colorParam('#ffffff'),
    secondsParam(6),
  ],
  build(values, ctx) {
    const items = str(values.items)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    const span = spanOf(ctx, num(values.seconds, 6));
    const stagger = Math.round(num(values.stagger, 0.6) * ctx.fps);
    const fontSize = Math.round(Math.min(ctx.height / (items.length * 1.9 + 2), ctx.height / 14));
    const top = Math.round(ctx.height / 2 - ((items.length - 1) * fontSize * 1.7) / 2);
    const texts = items.map((item, i) => {
      const start = ctx.startFrame + Math.min(i * stagger, Math.max(0, span - ctx.fps));
      return enterExit(
        createText(baseText(`${ctx.idPrefix}-item-${i}`, `• ${item}`, fontSize, str(values.color), start, ctx.startFrame + span - start), {
          x: Math.round(ctx.width * 0.12),
          y: Math.round(top + i * fontSize * 1.7),
        }),
        ctx,
        'slideRight',
        'fade',
        ctx.width * 0.05
      );
    });
    return { ...emptyOutput(), texts, endFrame: ctx.startFrame + span };
  },
};

// ================= CHART REVEAL =================
const PALETTE = ['#38bdf8', '#0ea5e9', '#6366f1', '#a855f7', '#10b981', '#f59e0b', '#f43f5e', '#14b8a6'];

/** "Label: 123" (or "Label 123") per line; the number accepts pt-BR or en-US separators. */
export function parseDataRows(text: string): ChartOverlay['data'] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const m = line.match(/^(.*?)[\s:=;]+(-?[\d.,]+)\s*$/);
      const parsed = m ? parseLocaleNumber(m[2]) : null;
      return {
        label: (m ? m[1] : line).trim() || String(i + 1),
        value: parsed ? parsed.value : 0,
        color: PALETTE[i % PALETTE.length],
      };
    });
}

const chartReveal: AnimationTemplate = {
  id: 'chartReveal',
  category: 'data',
  nameKey: 'templates.chartReveal.name',
  descriptionKey: 'templates.chartReveal.description',
  params: [
    { key: 'title', type: 'text', labelKey: 'templates.param.title', defaultKey: 'templates.chartReveal.defaultTitle' },
    { key: 'rows', type: 'lines', labelKey: 'templates.param.rows', defaultKey: 'templates.chartReveal.defaultRows' },
    {
      key: 'chartType',
      type: 'select',
      labelKey: 'templates.param.chartType',
      default: 'bar',
      options: [
        { value: 'bar', labelKey: 'inspector.chart.type.bar' },
        { value: 'donut', labelKey: 'inspector.chart.type.donut' },
        { value: 'line', labelKey: 'inspector.chart.type.line' },
      ],
    },
    secondsParam(5),
  ],
  build(values, ctx) {
    const span = spanOf(ctx, num(values.seconds, 5));
    const width = Math.round(Math.min(ctx.width * 0.55, ctx.height * 1.1));
    const height = Math.round(width * 0.62);
    const chart = enterExit(
      createChart(
        {
          id: `${ctx.idPrefix}-chart`,
          title: str(values.title),
          type: (str(values.chartType) || 'bar') as ChartType,
          width,
          height,
          data: parseDataRows(str(values.rows)),
          animationType: 'grow',
          visible: true,
          startFrame: ctx.startFrame,
          durationFrames: span,
          easing: 'easeOut',
          animDurationFrames: Math.round(span * 0.5),
        },
        { x: Math.round(ctx.width / 2), y: Math.round(ctx.height / 2) }
      ),
      ctx,
      'slideUp',
      'fade',
      ctx.height * 0.06
    );
    return { ...emptyOutput(), charts: [chart], endFrame: ctx.startFrame + span };
  },
};

// ================= CALLOUT =================
const ARROW_ROTATION: Record<string, number> = { right: 0, down: 90, left: 180, up: -90 };

const callout: AnimationTemplate = {
  id: 'callout',
  category: 'highlight',
  nameKey: 'templates.callout.name',
  descriptionKey: 'templates.callout.description',
  params: [
    { key: 'text', type: 'text', labelKey: 'templates.param.text', defaultKey: 'templates.callout.defaultText' },
    {
      key: 'direction',
      type: 'select',
      labelKey: 'templates.param.direction',
      default: 'down',
      options: [
        { value: 'down', labelKey: 'templates.direction.down' },
        { value: 'up', labelKey: 'templates.direction.up' },
        { value: 'left', labelKey: 'templates.direction.left' },
        { value: 'right', labelKey: 'templates.direction.right' },
      ],
    },
    colorParam('#f59e0b'),
    secondsParam(4),
  ],
  build(values, ctx) {
    const span = spanOf(ctx, num(values.seconds, 4));
    const direction = str(values.direction) in ARROW_ROTATION ? str(values.direction) : 'down';
    const len = Math.round(Math.min(ctx.width, ctx.height) * 0.16);
    const cx = Math.round(ctx.width / 2);
    const cy = Math.round(ctx.height / 2);
    let arrow = createShapeActor({
      id: `${ctx.idPrefix}-arrow`,
      name: str(values.text),
      style: defaultShapeStyle('arrow', str(values.color)),
      width: len,
      height: Math.round(len * 0.5),
      x: cx,
      y: cy,
      startFrame: ctx.startFrame,
      durationFrames: span,
    });
    arrow = { ...arrow, base: { ...arrow.base, rotation: ARROW_ROTATION[direction] } };
    arrow = enterExit(arrow, ctx, 'pop', 'fade', 0);
    // Attention pulse after the entrance: 100% → 115% → 100%, twice
    const beat = Math.round(ctx.fps * 0.3);
    let scale: Track<number> = arrow.tracks.scale ?? [];
    const pulseStart = ctx.startFrame + Math.round(ctx.fps * 0.6);
    [0, 1, 2, 3, 4].forEach((i) => {
      const frame = pulseStart + i * beat;
      if (frame < ctx.startFrame + span - Math.round(ctx.fps * 0.4)) {
        scale = setKeyframe(scale, frame, i % 2 === 1 ? 1.15 : 1, 'easeInOut');
      }
    });
    arrow = { ...arrow, tracks: { ...arrow.tracks, scale } };

    // The label sits on the arrow's tail side
    const textSize = Math.round(Math.min(ctx.width, ctx.height * 1.8) / 26);
    const label = str(values.text);
    const w = textWidth(label, textSize);
    const gap = len * 0.7;
    const tail = { right: { x: -1, y: 0 }, left: { x: 1, y: 0 }, down: { x: 0, y: -1 }, up: { x: 0, y: 1 } }[
      direction as 'right'
    ];
    const anchor = {
      x: Math.round(cx + tail.x * (gap + (tail.x < 0 ? w : 0)) - (tail.x === 0 ? w / 2 : 0)),
      y: Math.round(cy + tail.y * (gap + (tail.y > 0 ? textSize : 0)) + (tail.y === 0 ? textSize * 0.35 : 0)),
    };
    const text = enterExit(
      createText(baseText(`${ctx.idPrefix}-text`, label, textSize, '#ffffff', ctx.startFrame, span), anchor),
      ctx,
      'fade',
      'fade',
      0
    );
    return { ...emptyOutput(), actors: [arrow], texts: [text], endFrame: ctx.startFrame + span };
  },
};

export const TEMPLATES: AnimationTemplate[] = [title, lowerThird, bulletList, bigNumber, chartReveal, callout];

export function buildTemplate(template: AnimationTemplate, values: TemplateValues, ctx: TemplateContext) {
  return template.build(values, ctx);
}
