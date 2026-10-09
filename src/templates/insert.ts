import type { ActorOverlay, ChartOverlay, MotionPath, StudioLayer, TextOverlay } from '../types';
import type { AnimationTemplate, TemplateOutput, TemplateValues } from './types';

export interface TemplateTarget {
  actors: ActorOverlay[];
  charts: ChartOverlay[];
  texts: TextOverlay[];
  paths: MotionPath[];
  layers: StudioLayer[];
}

const shorten = (name: string) => (name.length > 28 ? `${name.slice(0, 27)}…` : name);

const layerFor = (type: StudioLayer['type'], id: string, name: string, color: string): StudioLayer => ({
  id: `layer-${type}-${id}`,
  name: shorten(name),
  type,
  visible: true,
  locked: false,
  color,
  targetId: id,
});

/** One layer per created object, so the template shows up in the layer panel. */
export function templateLayers(out: TemplateOutput): StudioLayer[] {
  return [
    ...out.texts.map((x) => layerFor('text', x.id, x.text, '#10b981')),
    ...out.charts.map((c) => layerFor('chart', c.id, c.title, '#0ea5e9')),
    ...out.actors.map((a) => layerFor('actor', a.id, a.name, '#f97316')),
    ...out.paths.map((p) => layerFor('path', p.id, p.name, '#38bdf8')),
  ];
}

/** The scene with the template's objects (and layers, in front) added. Everything else is kept. */
export function mergeTemplateOutput<T extends TemplateTarget>(present: T, out: TemplateOutput): T {
  return {
    ...present,
    actors: [...present.actors, ...out.actors],
    charts: [...present.charts, ...out.charts],
    texts: [...present.texts, ...out.texts],
    paths: [...present.paths, ...out.paths],
    layers: [...templateLayers(out), ...present.layers],
  };
}

const MAX_TEXT = 2000;

/** Validates agent-supplied values against the template's parameters; numbers are clamped. */
export function coerceTemplateValues(
  template: AnimationTemplate,
  input: Record<string, unknown>,
  defaults: TemplateValues
): TemplateValues {
  const values: TemplateValues = { ...defaults };
  for (const [key, raw] of Object.entries(input)) {
    const param = template.params.find((p) => p.key === key);
    if (!param) throw new Error(`UNKNOWN_TEMPLATE_PARAM:${key}`);
    const bad = () => new Error(`INVALID_TEMPLATE_VALUE:${key}`);
    switch (param.type) {
      case 'text':
      case 'lines':
        if (typeof raw !== 'string' || raw.length > MAX_TEXT) throw bad();
        values[key] = raw;
        break;
      case 'number':
        if (typeof raw !== 'number' || !Number.isFinite(raw)) throw bad();
        values[key] = Math.min(param.max, Math.max(param.min, raw));
        break;
      case 'color':
        if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) throw bad();
        values[key] = raw;
        break;
      case 'select':
        if (typeof raw !== 'string' || !param.options.some((o) => o.value === raw)) throw bad();
        values[key] = raw;
        break;
    }
  }
  return values;
}
