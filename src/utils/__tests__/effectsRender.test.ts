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
    // margin = ceil(3*blur + max(shadowBlur, glowRadius) + |shadowX|) + 1 = ceil(0 + 10 + 5) + 1 = 16
    expect(draws[0].args.slice(1, 3)).toEqual([-816, 0]); // off-screen copy casting the shadow
    expect(draws[1].args.slice(1, 3)).toEqual([0, 0]); // the object itself
    expect(main.calls).toContainEqual({ name: 'set:shadowOffsetX', args: [821] });
    expect(main.calls).toContainEqual({ name: 'set:shadowOffsetY', args: [7] });
    expect(main.calls).toContainEqual({ name: 'set:shadowBlur', args: [10] });
    expect(main.calls).toContainEqual({ name: 'set:shadowColor', args: ['#112233'] });
  });

  it('parks the shadow copy beyond the blur reach so no blurred ghost bleeds in at the left edge', () => {
    const { main, factory } = setup();
    const blur = 6;
    drawWithEffects(main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, blur, shadowOpacity: 0.5, shadowBlur: 0, shadowX: -40, glowRadius: 30 }, 1, () => {}, factory);
    const draws = main.calls.filter((c) => c.name === 'drawImage');
    expect(draws).toHaveLength(3); // shadow, glow, object
    [draws[0], draws[1]].forEach((d) => {
      const x = d.args[1] as number;
      expect(x + 800).toBeLessThanOrEqual(-(3 * blur) - 30 - 40);
    });
    // the shadow still lands at the requested offset from the object
    const offsets = main.calls.filter((c) => c.name === 'set:shadowOffsetX').map((c) => c.args[0] as number);
    expect((draws[0].args[1] as number) + offsets[0]).toBe(-40);
    expect((draws[1].args[1] as number) + offsets[1]).toBe(0);
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
    // the filter is only ever set inside a save/restore pair, so restore() resets it
    let depth = 0;
    main.calls.forEach((c) => {
      if (c.name === 'save') depth++;
      if (c.name === 'restore') depth--;
      if (c.name === 'set:filter') expect(depth).toBeGreaterThan(0);
    });
    expect(depth).toBe(0);
    expect(main.calls.some((c) => c.name === 'set:filter')).toBe(true);
  });

  it('gives the layer the main context transform (camera) and clears it first', () => {
    const { main, layer, factory } = setup();
    const cameraMatrix = { camera: true } as unknown as DOMMatrix;
    main.props.getTransform = () => cameraMatrix;
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 1 }, 1, () => {}, factory);
    const i = layer.calls.findIndex((c) => c.name === 'clearRect');
    expect(i).toBeGreaterThan(-1);
    expect(layer.calls.slice(i)).toContainEqual({ name: 'setTransform', args: [cameraMatrix] });
  });
});
