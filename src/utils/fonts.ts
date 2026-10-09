/** Closed list of fonts a text may use; the same list is requested in index.html. */
export const FONT_FAMILIES = [
  'Plus Jakarta Sans',
  'Inter',
  'Cormorant Garamond',
  'JetBrains Mono',
  'IBM Plex Mono',
] as const;

export const DEFAULT_FONT_FAMILY = 'Plus Jakarta Sans';
const DEFAULT_WEIGHT = 800;

export interface FontSpec {
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
}

const MONO = new Set<string>(['JetBrains Mono', 'IBM Plex Mono']);

/**
 * CSS font shorthand for the canvas. Unknown family names fall back to the default one, so text from
 * a file (or an agent) can never inject arbitrary CSS into `ctx.font`.
 */
export function fontCss(spec: FontSpec, size: number): string {
  const family = (FONT_FAMILIES as readonly string[]).includes(spec.fontFamily ?? '')
    ? (spec.fontFamily as string)
    : DEFAULT_FONT_FAMILY;
  const raw = Number.isFinite(spec.fontWeight) ? (spec.fontWeight as number) : DEFAULT_WEIGHT;
  const weight = Math.min(900, Math.max(100, Math.round(raw / 100) * 100));
  const stack = MONO.has(family) ? 'monospace' : family === 'Cormorant Garamond' ? 'serif' : 'sans-serif';
  return `${spec.italic ? 'italic ' : ''}${weight} ${size}px "${family}", ${stack}`;
}

/** Average glyph width in em, per family: used to estimate text boxes without a canvas to measure on. */
export function charWidthEm(fontFamily?: string): number {
  if (fontFamily && MONO.has(fontFamily)) return 0.6;
  return fontFamily === 'Cormorant Garamond' ? 0.45 : 0.55;
}

/** Makes the browser fetch the fonts a scene uses, so the first rendered frame already has them. */
export async function loadSceneFonts(texts: ReadonlyArray<FontSpec & { fontSize: number }>): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const wanted = new Set(texts.map((t) => fontCss(t, t.fontSize)));
  await Promise.all([...wanted].map((css) => document.fonts.load(css).catch(() => [])));
}
