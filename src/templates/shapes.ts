/**
 * Simple vector shapes as SVG data URLs, so templates can use bars, arrows and badges as ordinary
 * image actors (scalable, and saved inside the project like any imported image).
 */

export type ShapeKind = 'roundedRect' | 'circle' | 'arrow';

export interface ShapeOptions {
  width: number;
  height: number;
  color: string;
  /** Corner radius for rounded rectangles. */
  radius?: number;
}

function svg(width: number, height: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/** Keeps only safe color notations (hex, rgb/rgba/hsl, names) inside the SVG markup. */
function safeColor(color: string): string {
  return /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([\d\s.,%]+\)|[a-z]+)$/i.test(color.trim()) ? color.trim() : '#38bdf8';
}

export function shapeDataUrl(kind: ShapeKind, opts: ShapeOptions): string {
  const w = Math.max(1, Math.round(opts.width));
  const h = Math.max(1, Math.round(opts.height));
  const fill = safeColor(opts.color);
  switch (kind) {
    case 'circle':
      return svg(w, h, `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}"/>`);
    case 'arrow': {
      // Pointing right; rotate the actor to point elsewhere
      const shaft = h * 0.34;
      const head = Math.min(w * 0.45, h * 1.1);
      const y1 = (h - shaft) / 2;
      const points = [
        [0, y1],
        [w - head, y1],
        [w - head, 0],
        [w, h / 2],
        [w - head, h],
        [w - head, y1 + shaft],
        [0, y1 + shaft],
      ]
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
      return svg(w, h, `<polygon points="${points}" fill="${fill}"/>`);
    }
    case 'roundedRect':
    default: {
      const r = Math.min(opts.radius ?? h / 4, w / 2, h / 2);
      return svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`);
    }
  }
}
