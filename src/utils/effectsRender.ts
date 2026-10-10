/**
 * Composites an object with its effects (shadow, glow, blur, tint). The object is painted on an
 * off-screen layer the size of the output, which gets the main context's current matrix (so the
 * camera is already applied), and is composed back with an identity matrix. Radii are output pixels.
 */
import type { EffectParams } from '../types';

type Ctx = CanvasRenderingContext2D;
export interface EffectLayer {
  canvas: CanvasImageSource;
  ctx: Ctx;
}
export type LayerFactory = (width: number, height: number) => EffectLayer;

let cached: { width: number; height: number; layer: EffectLayer } | null = null;

/** One reusable layer; recreated only when the output size changes. */
export const defaultLayerFactory: LayerFactory = (width, height) => {
  if (cached && cached.width === width && cached.height === height) return cached.layer;
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as Ctx;
  cached = { width, height, layer: { canvas, ctx } };
  return cached.layer;
};

/** `ctx.filter` is missing in some browsers (old Safari): blur is then skipped. */
export function canvasFilterSupported(): boolean {
  return typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
}

export function drawWithEffects(
  ctx: Ctx,
  width: number,
  height: number,
  fx: EffectParams,
  opacity: number,
  draw: (c: Ctx) => void,
  makeLayer: LayerFactory = defaultLayerFactory
): void {
  const layer = makeLayer(width, height);
  const l = layer.ctx;
  const matrix = ctx.getTransform();

  l.save();
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, width, height);
  l.setTransform(matrix);
  draw(l);
  l.restore();

  if (fx.tintAmount > 0) {
    l.save();
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-atop';
    l.globalAlpha = fx.tintAmount;
    l.fillStyle = fx.tintColor;
    l.fillRect(0, 0, width, height);
    l.restore();
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.blur > 0) ctx.filter = `blur(${fx.blur}px)`;
  const baseAlpha = ctx.globalAlpha * opacity;

  // A copy parked off-screen casts only its shadow into view (offset compensates the parking spot)
  const castShadow = (color: string, blur: number, dx: number, dy: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = width + dx;
    ctx.shadowOffsetY = dy;
    ctx.drawImage(layer.canvas, -width, 0);
    ctx.restore();
  };
  if (fx.shadowOpacity > 0) castShadow(fx.shadowColor, fx.shadowBlur, fx.shadowX, fx.shadowY, fx.shadowOpacity);
  if (fx.glowRadius > 0 && fx.glowStrength > 0) castShadow(fx.glowColor, fx.glowRadius, 0, 0, fx.glowStrength);

  ctx.globalAlpha = baseAlpha;
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}
