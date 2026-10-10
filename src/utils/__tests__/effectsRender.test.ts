import { describe, expect, it } from 'vitest';
import { drawWithEffects, type EffectLayer } from '../effectsRender';
import { DEFAULT_EFFECTS } from '../../engine/effects';
import { createCanvasStub } from '../../test/canvasStub';

const setup = () => {
  const main = createCanvasStub();
  const layer = createCanvasStub();
  const layerCanvas = { tag: 'layer' } as unknown as CanvasImageSource;
  const factory = () => ({ canvas: layerCanvas, ctx: layer.ctx }) as EffectLayer;
  return { main, layer, layerCanvas, factory };
};
const names = (calls: { name: string }[]) => calls.map((c) => c.name);

describe('drawWithEffects', () => {
  it('paints the object on the off-screen layer, not on the main context', () => {
    const { main, layer, factory } = setup();
    let drewOn: unknown;
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 4 }, 1, (c) => { drewOn = c; }, factory);
    expect(drewOn).toBe(layer.ctx);
    expect(names(main.calls)).toContain('drawImage');
  });

  it('applies tint on the layer with source-atop before composing', () => {
    const { main, layer, factory } = setup();
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, tintAmount: 0.5, tintColor: '#00ff00' }, 1, () => {}, factory);
    expect(layer.calls).toContainEqual({ name: 'set:globalCompositeOperation', args: ['source-atop'] });
    expect(layer.calls).toContainEqual({ name: 'set:fillStyle', args: ['#00ff00'] });
    expect(layer.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.5] });
    expect(layer.calls.findIndex((c) => c.name === 'fillRect')).toBeGreaterThan(-1);
  });

  it('draws the shadow first (object off-screen so only the shadow shows), then the object', () => {
    const { main, factory } = setup();
    drawWithEffects(
      main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, shadowOpacity: 0.6, shadowBlur: 10, shadowX: 5, shadowY: 7, shadowColor: '#112233' },
      1, () => {}, factory);
    const draws = main.calls.filter((c) => c.name === 'drawImage');
    expect(draws).toHaveLength(2);
    expect(draws[0].args.slice(1, 3)).toEqual([-800, 0]); // off-screen copy casting the shadow
    expect(draws[1].args.slice(1, 3)).toEqual([0, 0]); // the object itself
    expect(main.calls).toContainEqual({ name: 'set:shadowOffsetX', args: [805] });
    expect(main.calls).toContainEqual({ name: 'set:shadowOffsetY', args: [7] });
    expect(main.calls).toContainEqual({ name: 'set:shadowBlur', args: [10] });
    expect(main.calls).toContainEqual({ name: 'set:shadowColor', args: ['#112233'] });
  });

  it('draws glow behind the object with its strength as alpha', () => {
    const { main, factory } = setup();
    drawWithEffects(main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, glowRadius: 20, glowStrength: 0.5, glowColor: '#ffcc00' }, 1, () => {}, factory);
    expect(main.calls.filter((c) => c.name === 'drawImage')).toHaveLength(2);
    expect(main.calls).toContainEqual({ name: 'set:shadowColor', args: ['#ffcc00'] });
    expect(main.calls).toContainEqual({ name: 'set:shadowBlur', args: [20] });
    expect(main.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.5] });
  });

  it('applies blur as a canvas filter and applies opacity only once, on the composition', () => {
    const { main, layer, factory } = setup();
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 6, shadowOpacity: 0.5 }, 0.4, () => {}, factory);
    expect(main.calls).toContainEqual({ name: 'set:filter', args: ['blur(6px)'] });
    expect(main.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.4] });
    expect(layer.calls.some((c) => c.name === 'set:globalAlpha' && c.args[0] === 0.4)).toBe(false);
  });

  it('does not leave filter or shadow state behind', () => {
    const { main, factory } = setup();
    drawWithEffects(main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, blur: 6, shadowOpacity: 0.5, glowRadius: 5 }, 1, () => {}, factory);
    const n = (name: string) => main.calls.filter((c) => c.name === name).length;
    expect(n('save')).toBe(n('restore'));
  });

  it('gives the layer the main context transform (camera) and clears it first', () => {
    const { main, layer, factory } = setup();
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 1 }, 1, () => {}, factory);
    const i = layer.calls.findIndex((c) => c.name === 'clearRect');
    expect(i).toBeGreaterThan(-1);
    expect(names(layer.calls).slice(i)).toContain('setTransform');
  });
});
