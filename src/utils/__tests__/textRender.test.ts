import { describe, expect, it } from 'vitest';
import { renderCompositeFrame, type SceneContent } from '../exportVideo';
import { createText } from '../../engine/overlays';
import { createCanvasStub } from '../../test/canvasStub';
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
});
