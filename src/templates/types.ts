/**
 * A template is a pure function from a few parameters to ordinary scene objects (actors, charts,
 * texts, paths) with ordinary keyframes. Nothing in the scene knows it came from a template, so the
 * result is edited with the normal tools. The dialog renders the parameter form from `params`.
 */
import type { ActorOverlay, ChartOverlay, MotionPath, TextOverlay } from '../types';
import type { MessageKey } from '../i18n';

interface ParamBase {
  key: string;
  labelKey: MessageKey;
}

export type TemplateParam =
  | (ParamBase & { type: 'text'; defaultKey: MessageKey })
  /** One item per line (list items, "Label: value" rows). */
  | (ParamBase & { type: 'lines'; defaultKey: MessageKey })
  | (ParamBase & { type: 'number'; default: number; min: number; max: number; step: number })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'select'; default: string; options: { value: string; labelKey: MessageKey }[] });

export type TemplateValues = Record<string, string | number>;

export interface TemplateContext {
  width: number;
  height: number;
  fps: number;
  /** Frame where the template's objects start (usually the current frame). */
  startFrame: number;
  /** Unique prefix for the ids of the created objects. */
  idPrefix: string;
}

export interface TemplateOutput {
  actors: ActorOverlay[];
  charts: ChartOverlay[];
  texts: TextOverlay[];
  paths: MotionPath[];
  /** Last frame used by the template, so the timeline can grow to fit it. */
  endFrame: number;
}

export type TemplateCategory = 'titles' | 'data' | 'highlight' | 'maps';

export interface AnimationTemplate {
  id: string;
  category: TemplateCategory;
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  params: TemplateParam[];
  build(values: TemplateValues, ctx: TemplateContext): TemplateOutput;
}

/** Default value of every parameter, with texts in the interface language. */
export function defaultValues(template: AnimationTemplate, translate: (key: MessageKey) => string): TemplateValues {
  const values: TemplateValues = {};
  template.params.forEach((p) => {
    values[p.key] = p.type === 'text' || p.type === 'lines' ? translate(p.defaultKey) : p.default;
  });
  return values;
}

export const emptyOutput = (): Omit<TemplateOutput, 'endFrame'> => ({ actors: [], charts: [], texts: [], paths: [] });
