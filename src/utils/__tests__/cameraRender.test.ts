import { describe, expect, it } from 'vitest';
import { renderCompositeFrame, type SceneContent } from '../exportVideo';
import { createText } from '../../engine/overlays';
import { createCanvasStub } from '../../test/canvasStub';
import type { SceneCamera } from '../../types';

const zoom2: SceneCamera = { base: { panX: 0, panY: 0, zoom: 2, rotation: 0 }, tracks: {} };
const scene = (camera?: SceneCamera): SceneContent => ({
  frames: {}, charts: [], images: [], actors: [], paths: [], layers: [], fps: 24, camera,
  texts: [createText({ id: 't', text: 'Hi', fontSize: 40, color: '#fff', effect: 'none', visible: true, startFrame: 1, durationFrames: 30 }, { x: 10, y: 50 })],
  videoBg: { type: 'color', color: '#000', opacity: 1, playbackRate: 1 },
});
const scaled = (calls: { name: string; args: unknown[] }[]) => calls.some((c) => c.name === 'scale' && c.args[0] === 2 && c.args[1] === 2);

describe('camera in the renderer', () => {
  it('applies the camera transform', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene(zoom2));
    expect(scaled(calls)).toBe(true);
  });
  it('can be turned off for the editor stage', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene(zoom2), { camera: false });
    expect(scaled(calls)).toBe(false);
  });
  it('does nothing extra for the identity camera or no camera', () => {
    for (const camera of [undefined, { base: { panX: 0, panY: 0, zoom: 1, rotation: 0 }, tracks: {} }]) {
      const { ctx, calls } = createCanvasStub();
      renderCompositeFrame(ctx, 1280, 720, 5, scene(camera));
      expect(scaled(calls)).toBe(false);
    }
  });
  it('keeps save/restore balanced', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene(zoom2));
    const count = (n: string) => calls.filter((c) => c.name === n).length;
    expect(count('save')).toBe(count('restore'));
  });
});
