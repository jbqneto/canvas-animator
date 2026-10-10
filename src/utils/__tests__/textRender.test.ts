import { describe, expect, it } from 'vitest';
import { renderCompositeFrame, type SceneContent } from '../exportVideo';
import { createText } from '../../engine/overlays';
import { createCanvasStub } from '../../test/canvasStub';
import { DEFAULT_EFFECTS } from '../../engine/effects';
import { createShapeActor } from '../../engine/shapes';
import type { TextOverlay } from '../../types';

const scene = (texts: TextOverlay[]): SceneContent => ({
  frames: {}, charts: [], texts, images: [], actors: [], paths: [], layers: [],
  videoBg: { type: 'color', color: '#06080C', opacity: 1, playbackRate: 1 }, fps: 24,
});
const text = (over: Partial<TextOverlay> = {}) =>
  createText(
    { id: 't1', text: 'Hello', fontSize: 84, color: '#fff', effect: 'none', visible: true, startFrame: 1, durationFrames: 60, ...over },
    { x: 100, y: 200 }
  );

describe('text rendering', () => {
  it('uses the default font when no typography is set', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene([text()]));
    expect(calls).toContainEqual({ name: 'set:font', args: ['800 84px "Plus Jakarta Sans", sans-serif'] });
    expect(calls.some((c) => c.name === 'set:letterSpacing')).toBe(false);
  });
  it('applies family, weight, italic and letter spacing', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(
      ctx, 1280, 720, 5,
      scene([text({ fontFamily: 'Cormorant Garamond', fontWeight: 500, italic: true, letterSpacing: 6 })])
    );
    expect(calls).toContainEqual({ name: 'set:font', args: ['italic 500 84px "Cormorant Garamond", serif'] });
    expect(calls).toContainEqual({ name: 'set:letterSpacing', args: ['6px'] });
  });

  describe('typewriter cursor', () => {
    const typed = (over: Partial<TextOverlay> = {}) => text({ text: 'ABCDEFGH', effect: 'typewriter', ...over });
    const shown = (calls: { name: string; args: unknown[] }[]) => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    it('shows the blinking cursor while typing by default', () => {
      const { ctx, calls } = createCanvasStub();
      renderCompositeFrame(ctx, 1280, 720, 5, scene([typed()])); // 4 elapsed frames = 2 characters
      expect(shown(calls)).toContain('AB|');
    });
    it('hides the cursor when typewriterCursor is false', () => {
      const { ctx, calls } = createCanvasStub();
      renderCompositeFrame(ctx, 1280, 720, 5, scene([typed({ typewriterCursor: false })]));
      expect(shown(calls)).toContain('AB');
      expect(shown(calls)).not.toContain('AB|');
    });
  });

  describe('effects', () => {
    it('without effects does not touch an off-screen layer', () => {
      const { ctx, calls } = createCanvasStub();
      let made = 0;
      renderCompositeFrame(ctx, 1280, 720, 5, scene([text()]), {
        createLayer: () => { made++; return { canvas: {} as CanvasImageSource, ctx } as never; },
      });
      expect(made).toBe(0);
      expect(calls.some((c) => c.name === 'drawImage')).toBe(false);
    });
    it('with an active effect draws the text on the layer and composes it', () => {
      const main = createCanvasStub();
      const layer = createCanvasStub();
      renderCompositeFrame(main.ctx, 1280, 720, 5,
        scene([text({ effects: { ...DEFAULT_EFFECTS, blur: 8 } })]),
        { createLayer: () => ({ canvas: {} as CanvasImageSource, ctx: layer.ctx }) });
      expect(layer.calls.some((c) => c.name === 'fillText')).toBe(true);
      expect(main.calls.some((c) => c.name === 'fillText')).toBe(false);
      expect(main.calls).toContainEqual({ name: 'set:filter', args: ['blur(8px)'] });
    });
    it('goes back to the plain path once the trigger animates to 0', () => {
      const main = createCanvasStub();
      let made = 0;
      const t = text({ tracks: { blur: [{ frame: 1, value: 8, easing: 'linear' }, { frame: 5, value: 0 }] } });
      renderCompositeFrame(main.ctx, 1280, 720, 5, scene([t]),
        { createLayer: () => { made++; return { canvas: {} as CanvasImageSource, ctx: main.ctx }; } });
      expect(made).toBe(0);
    });
    it('draws an actor with effects on the layer at full alpha, composes it with its opacity, and keeps the trail on the main context', () => {
      // save/restore that really restore state (the plain stub only records them), so the
      // trail's own globalAlpha does not leak into the composition as it would not on a real canvas
      const main = createCanvasStub();
      const stack: Record<string, unknown>[] = [];
      main.props.save = () => { main.calls.push({ name: 'save', args: [] }); stack.push({ ...main.props }); };
      main.props.restore = () => {
        main.calls.push({ name: 'restore', args: [] });
        const prev = stack.pop();
        if (prev) Object.assign(main.props, prev);
      };
      const layer = createCanvasStub();
      const actor = {
        ...createShapeActor({
          id: 'a1', name: 'box', style: { type: 'rect', fill: '#f00', stroke: '#000', strokeWidth: 0, radius: 0 },
          width: 50, height: 50, x: 0, y: 0, startFrame: 1, durationFrames: 60,
        }),
        trail: { enabled: true, color: '#0f0', width: 2, dashed: false },
        effects: { ...DEFAULT_EFFECTS, blur: 4 },
      };
      actor.base = { ...actor.base, opacity: 0.5 };
      actor.tracks = { position: [{ frame: 1, value: { x: 0, y: 0 }, easing: 'linear' }, { frame: 10, value: { x: 90, y: 0 } }] };
      renderCompositeFrame(main.ctx, 1280, 720, 5, { ...scene([]), actors: [actor] },
        { createLayer: () => ({ canvas: {} as CanvasImageSource, ctx: layer.ctx }) });
      expect(layer.calls).toContainEqual({ name: 'set:globalAlpha', args: [1] });
      expect(layer.calls.some((c) => c.name === 'fill')).toBe(true);
      expect(main.calls.some((c) => c.name === 'fill')).toBe(false);
      const composeAt = main.calls.findIndex((c) => c.name === 'drawImage');
      expect(main.calls.slice(0, composeAt).filter((c) => c.name === 'set:globalAlpha').pop()).toEqual({ name: 'set:globalAlpha', args: [0.5] });
      expect(main.calls.findIndex((c) => c.name === 'stroke')).toBeGreaterThan(-1);
      expect(main.calls.findIndex((c) => c.name === 'stroke')).toBeLessThan(composeAt);
      expect(layer.calls.some((c) => c.name === 'stroke')).toBe(false);
    });
  });
});
