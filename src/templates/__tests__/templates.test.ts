import { describe, expect, it } from 'vitest';
import { TEMPLATES, parseDataRows } from '../library';
import { defaultValues, TemplateContext } from '../types';
import { sampleActor } from '../../engine/actor';
import { translate } from '../../i18n';

const ctx = (over: Partial<TemplateContext> = {}): TemplateContext => ({
  width: 1280,
  height: 720,
  fps: 24,
  startFrame: 10,
  idPrefix: 'tpl',
  ...over,
});

describe('template library', () => {
  for (const template of TEMPLATES) {
    describe(template.id, () => {
      for (const size of [ctx(), ctx({ width: 1080, height: 1920 })]) {
        it(`builds editable objects on screen (${size.width}×${size.height})`, () => {
          const out = template.build(defaultValues(template, (k) => translate('pt-BR', k)), size);
          const objects = [...out.actors, ...out.charts, ...out.texts];
          expect(objects.length).toBeGreaterThan(0);
          // ids unique and prefixed, so inserting twice never collides
          const ids = objects.map((o) => o.id);
          expect(new Set(ids).size).toBe(ids.length);
          ids.forEach((id) => expect(id.startsWith('tpl-')).toBe(true));
          for (const o of objects) {
            expect(o.startFrame).toBeGreaterThanOrEqual(10);
            expect(o.startFrame + o.durationFrames).toBeLessThanOrEqual(out.endFrame);
            // Mid-span, every object is visible, opaque and inside the canvas
            const mid = sampleActor(o, Math.round(o.startFrame + o.durationFrames / 2));
            expect(mid.visible).toBe(true);
            expect(mid.opacity).toBeGreaterThan(0.9);
            expect(mid.x).toBeGreaterThanOrEqual(0);
            expect(mid.x).toBeLessThanOrEqual(size.width);
            expect(mid.y).toBeGreaterThanOrEqual(0);
            expect(mid.y).toBeLessThanOrEqual(size.height);
            // ...and it enters: hidden or small at its first frame
            const first = sampleActor(o, o.startFrame);
            expect(first.opacity < 0.05 || first.scale < 0.05).toBe(true);
          }
        });
      }
    });
  }

  it('the duration parameter sets the span', () => {
    const title = TEMPLATES.find((t) => t.id === 'title')!;
    const out = title.build({ ...defaultValues(title, (k) => k), seconds: 3 }, ctx());
    expect(out.endFrame).toBe(10 + 72);
  });

  it('staggers list items', () => {
    const list = TEMPLATES.find((t) => t.id === 'bulletList')!;
    const out = list.build({ items: 'a\nb\n\nc', stagger: 0.5, color: '#fff', seconds: 6 }, ctx());
    expect(out.texts.map((t) => t.startFrame)).toEqual([10, 22, 34]);
    expect(out.texts.every((t) => t.startFrame + t.durationFrames === out.endFrame)).toBe(true);
  });
});

describe('helpers', () => {
  it('parses "label: value" rows in either number format', () => {
    expect(parseDataRows('Jan: 1.234,5\nFev 80\n\nMar=2,5\nsem número').map((r) => [r.label, r.value])).toEqual([
      ['Jan', 1234.5],
      ['Fev', 80],
      ['Mar', 2.5],
      ['sem número', 0],
    ]);
  });

  it('uses editable shapes (not images) for bars and arrows, in the chosen color', () => {
    const lower = TEMPLATES.find((t) => t.id === 'lowerThird')!;
    const bar = lower.build({ ...defaultValues(lower, (k) => k), color: '#ff0000' }, ctx()).actors[0];
    expect(bar.kind).toBe('shape');
    expect(bar.shape).toMatchObject({ type: 'rect', fill: '#ff0000' });
    const callout = TEMPLATES.find((t) => t.id === 'callout')!;
    expect(callout.build(defaultValues(callout, (k) => k), ctx()).actors[0].shape?.type).toBe('arrow');
  });
});
