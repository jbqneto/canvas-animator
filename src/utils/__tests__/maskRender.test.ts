import { describe, expect, it } from 'vitest';
import { renderCompositeFrame, type SceneContent } from '../exportVideo';
import { createText } from '../../engine/overlays';
import { createShapeActor, defaultShapeStyle } from '../../engine/shapes';
import { DEFAULT_EFFECTS } from '../../engine/effects';
import { createCanvasStub, type CtxCall } from '../../test/canvasStub';
import type { EffectLayer } from '../effectsRender';
import type { ActorOverlay, MaskRef, SceneCamera, TextOverlay } from '../../types';

const maskActor = (over: Partial<ActorOverlay> = {}): ActorOverlay => ({
  ...createShapeActor({ id: 'm', name: 'm', style: { ...defaultShapeStyle('rect'), radius: 0 }, width: 100, height: 50, x: 200, y: 100, startFrame: 1, durationFrames: 30 }),
  ...over,
});
const text = (mask?: MaskRef, over: Partial<TextOverlay> = {}): TextOverlay => ({
  ...createText({ id: 't', text: 'Hi', fontSize: 40, color: '#fff', effect: 'none', visible: true, startFrame: 1, durationFrames: 30 }, { x: 10, y: 50 }),
  ...(mask ? { mask } : {}),
  ...over,
});
const scene = (actors: ActorOverlay[], texts: TextOverlay[], camera?: SceneCamera): SceneContent => ({
  frames: {}, charts: [], images: [], actors, paths: [], layers: [], fps: 24, camera, texts,
  videoBg: { type: 'color', color: '#000', opacity: 1, playbackRate: 1 },
});
const render = (s: SceneContent, options = {}) => {
  const { ctx, calls } = createCanvasStub();
  renderCompositeFrame(ctx, 1280, 720, 5, s, options);
  return calls;
};
const count = (calls: CtxCall[], name: string) => calls.filter((c) => c.name === name).length;
const indexOf = (calls: CtxCall[], name: string) => calls.findIndex((c) => c.name === name);
/** Index of the restore that closes the save at `saveIndex`. */
const matchingRestore = (calls: CtxCall[], saveIndex: number) => {
  let depth = 0;
  for (let i = saveIndex; i < calls.length; i++) {
    if (calls[i].name === 'save') depth++;
    if (calls[i].name === 'restore' && --depth === 0) return i;
  }
  return -1;
};
const expectBalanced = (calls: CtxCall[]) => expect(count(calls, 'save')).toBe(count(calls, 'restore'));
const inside: MaskRef = { actorId: 'm', mode: 'inside' };

describe('mask clip in the renderer', () => {
  it('inside: clips by the shape contour around the target draw', () => {
    const calls = render(scene([maskActor({ maskOnly: true })], [text(inside)]));
    const clip = indexOf(calls, 'clip');
    expect(clip).toBeGreaterThan(0);
    expect(calls[clip].args.length === 0 || calls[clip].args[0] === 'nonzero').toBe(true);
    const save = clip - 7;
    expect(calls.slice(save, clip).map((c) => c.name)).toEqual(['save', 'beginPath', 'moveTo', 'lineTo', 'lineTo', 'lineTo', 'closePath']);
    expect(calls[save + 2].args).toEqual([150, 75]);
    const fill = calls.findIndex((c, i) => i > clip && c.name === 'fillText');
    expect(fill).toBeGreaterThan(clip);
    expect(matchingRestore(calls, save)).toBeGreaterThan(fill);
    expectBalanced(calls);
  });

  it('outside: a huge rect precedes the contour and the clip uses evenodd', () => {
    const calls = render(scene([maskActor({ maskOnly: true })], [text({ actorId: 'm', mode: 'outside' })]));
    const clip = indexOf(calls, 'clip');
    expect(calls[clip].args).toEqual(['evenodd']);
    const rect = calls.findIndex((c) => c.name === 'rect');
    expect(rect).toBeGreaterThan(-1);
    expect(rect).toBeLessThan(clip);
    expect(calls[rect].args[2] as number).toBeGreaterThanOrEqual(1e5);
    const moveTo = calls.findIndex((c, i) => i > rect && c.name === 'moveTo');
    expect(moveTo).toBeLessThan(clip);
    expectBalanced(calls);
  });

  it('clips inside camera space', () => {
    const zoom2: SceneCamera = { base: { panX: 0, panY: 0, zoom: 2, rotation: 0 }, tracks: {} };
    const calls = render(scene([maskActor({ maskOnly: true })], [text(inside)], zoom2));
    const scale = calls.findIndex((c) => c.name === 'scale' && c.args[0] === 2 && c.args[1] === 2);
    expect(scale).toBeGreaterThan(-1);
    expect(scale).toBeLessThan(indexOf(calls, 'clip'));
    expectBalanced(calls);
  });

  it('does not draw a mask-only actor, except as a dashed outline in the editor', () => {
    const plain = render(scene([maskActor({ maskOnly: true })], []));
    expect(count(plain, 'fill')).toBe(0);
    expect(count(plain, 'roundRect')).toBe(0);
    expect(count(plain, 'stroke')).toBe(0);
    const editor = render(scene([maskActor({ maskOnly: true })], []), { showMasks: true });
    expect(count(editor, 'fill')).toBe(0);
    expect(count(editor, 'roundRect')).toBe(0);
    expect(editor.some((c) => c.name === 'setLineDash' && (c.args[0] as number[]).length > 0)).toBe(true);
    expect(count(editor, 'stroke')).toBeGreaterThan(0);
    expectBalanced(editor);
    // Still shown in the editor when fully transparent
    const ghost = render(scene([maskActor({ maskOnly: true, base: { ...maskActor().base, opacity: 0 } })], []), { showMasks: true });
    expect(count(ghost, 'stroke')).toBeGreaterThan(0);
  });

  it('draws no ghost for a maskOnly line or image actor', () => {
    const line = maskActor({ maskOnly: true, shape: { ...defaultShapeStyle('line') } });
    const image = maskActor({ maskOnly: true, kind: 'image', shape: undefined });
    for (const a of [line, image]) {
      const calls = render(scene([a], []), { showMasks: true });
      expect(calls.some((c) => c.name === 'setLineDash' && (c.args[0] as number[]).length > 0)).toBe(false);
      expectBalanced(calls);
    }
  });

  it('draws the target whole when the mask is out of span or missing', () => {
    for (const actors of [[maskActor({ startFrame: 50 })], []]) {
      const calls = render(scene(actors, [text(inside)]));
      expect(count(calls, 'clip')).toBe(0);
      expect(count(calls, 'fillText')).toBeGreaterThan(0);
      expectBalanced(calls);
    }
  });

  it('mutual masks clip each object once, without recursion', () => {
    const a = maskActor({ id: 'a', mask: { actorId: 'b', mode: 'inside' } });
    const b = maskActor({ id: 'b', mask: { actorId: 'a', mode: 'inside' } });
    const calls = render(scene([a, b], []));
    expect(count(calls, 'clip')).toBe(2);
    expect(count(calls, 'fill')).toBe(2);
    expectBalanced(calls);
  });

  it('a degenerate mask never puts a non-finite number on the canvas', () => {
    const degenerate = [
      maskActor({ maskOnly: true, base: { ...maskActor().base, scale: 0 } }),
      maskActor({ maskOnly: true, width: 0, height: 0 }),
      maskActor({ maskOnly: true, width: NaN, height: Infinity }),
    ];
    for (const m of degenerate) {
      for (const mode of ['inside', 'outside'] as const) {
        let calls: CtxCall[] = [];
        expect(() => { calls = render(scene([m], [text({ actorId: 'm', mode })]), { showMasks: true }); }).not.toThrow();
        const numbers = calls.flatMap((c) => c.args.flat()).filter((v) => typeof v === 'number') as number[];
        expect(numbers.every(Number.isFinite)).toBe(true);
        expectBalanced(calls);
      }
    }
  });

  it('a scene without masks renders exactly as before: no clip, same calls, balanced', () => {
    const shape = maskActor();
    const before = render(scene([shape], [text()]));
    const withUndefined = render(scene([{ ...shape, mask: undefined, maskOnly: undefined }], [text(undefined, { mask: undefined })]));
    expect(count(before, 'clip')).toBe(0);
    expect(withUndefined).toEqual(before);
    expectBalanced(before);
  });

  it('effects are composed under the clip, so it cuts shadow and glow too', () => {
    const layer = createCanvasStub();
    const layerCanvas = { tag: 'layer' } as unknown as CanvasImageSource;
    const createLayer = () => ({ canvas: layerCanvas, ctx: layer.ctx }) as EffectLayer;
    const glowing = text(inside, { effects: { ...DEFAULT_EFFECTS, glowRadius: 12 } });
    const calls = render(scene([maskActor({ maskOnly: true })], [glowing]), { createLayer });
    const clip = indexOf(calls, 'clip');
    const save = clip - 7;
    expect(calls[save].name).toBe('save');
    const restore = matchingRestore(calls, save);
    const draws = calls.map((c, i) => (c.name === 'drawImage' && c.args[0] === layerCanvas ? i : -1)).filter((i) => i >= 0);
    expect(draws.length).toBe(2); // glow, then the object
    draws.forEach((i) => {
      expect(i).toBeGreaterThan(clip);
      expect(i).toBeLessThan(restore);
    });
    expectBalanced(calls);
  });
});
