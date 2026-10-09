import { describe, expect, it } from 'vitest';
import { coerceTemplateValues, mergeTemplateOutput, templateLayers } from '../insert';
import { TEMPLATES } from '../library';
import { defaultValues } from '../types';

const title = TEMPLATES.find((t) => t.id === 'title')!;
const defaults = defaultValues(title, (k) => k);
const out = title.build({ ...defaults, title: 'A very long title that should be shortened in the layer list' }, {
  width: 1280, height: 720, fps: 24, startFrame: 1, idPrefix: 'tpl-x',
});

describe('mergeTemplateOutput', () => {
  it('appends objects and puts their layers in front, keeping the other fields', () => {
    const present = { actors: [], charts: [], texts: [], paths: [], layers: [], markers: [{ id: 'm' }] } as any;
    const merged = mergeTemplateOutput(present, out);
    expect(merged.texts).toHaveLength(out.texts.length);
    expect(merged.layers[0]).toMatchObject({ type: 'text', targetId: out.texts[0].id, visible: true, locked: false });
    expect(merged.markers).toEqual([{ id: 'm' }]);
  });
  it('shortens long layer names', () => {
    const [layer] = templateLayers(out);
    expect(layer.name.length).toBeLessThanOrEqual(28);
    expect(layer.name.endsWith('…')).toBe(true);
  });
});

describe('coerceTemplateValues', () => {
  it('overrides defaults with valid input', () => {
    expect(coerceTemplateValues(title, { title: 'Hi', seconds: 5 }, defaults)).toMatchObject({ title: 'Hi', seconds: 5 });
  });
  it('clamps numbers to the parameter range', () => {
    expect(coerceTemplateValues(title, { seconds: 9999 }, defaults).seconds).toBe(60);
    expect(coerceTemplateValues(title, { seconds: -5 }, defaults).seconds).toBe(1);
  });
  it('rejects unknown parameters and wrong types', () => {
    expect(() => coerceTemplateValues(title, { nope: 1 }, defaults)).toThrow('UNKNOWN_TEMPLATE_PARAM:nope');
    expect(() => coerceTemplateValues(title, { seconds: 'x' }, defaults)).toThrow('INVALID_TEMPLATE_VALUE:seconds');
    expect(() => coerceTemplateValues(title, { seconds: Number.NaN }, defaults)).toThrow('INVALID_TEMPLATE_VALUE:seconds');
    expect(() => coerceTemplateValues(title, { title: 42 }, defaults)).toThrow('INVALID_TEMPLATE_VALUE:title');
    expect(() => coerceTemplateValues(title, { title: 'x'.repeat(2001) }, defaults)).toThrow('INVALID_TEMPLATE_VALUE:title');
  });
  it('validates colors and select options', () => {
    expect(() => coerceTemplateValues(title, { color: 'red' }, defaults)).toThrow('INVALID_TEMPLATE_VALUE:color');
    expect(coerceTemplateValues(title, { color: '#E8B65A' }, defaults).color).toBe('#E8B65A');
    expect(() => coerceTemplateValues(title, { entrance: 'spin' }, defaults)).toThrow('INVALID_TEMPLATE_VALUE:entrance');
    expect(coerceTemplateValues(title, { entrance: 'pop' }, defaults).entrance).toBe('pop');
  });
});
