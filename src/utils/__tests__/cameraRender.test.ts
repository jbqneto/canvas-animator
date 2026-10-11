import { describe, expect, it } from 'vitest';
import { renderCompositeFrame, type SceneContent } from '../exportVideo';
import { createText } from '../../engine/overlays';
import { createCanvasStub } from '../../test/canvasStub';
import type { SceneCamera, TextOverlay } from '../../types';

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
  it('paints the background before the camera transform', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene(zoom2));
    const fill = calls.findIndex((c) => c.name === 'fillRect');
    const scale = calls.findIndex((c) => c.name === 'scale' && c.args[0] === 2 && c.args[1] === 2);
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(fill).toBeLessThan(scale);
  });
  it('still applies the camera on a transparent render', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene(zoom2), { transparent: true });
    expect(scaled(calls)).toBe(true);
  });
  it('keeps save/restore balanced', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, scene(zoom2));
    const count = (n: string) => calls.filter((c) => c.name === n).length;
    expect(count('save')).toBe(count('restore'));
  });
});

describe('parallax in the renderer', () => {
  const text = (id: string, label: string, parallax?: number): TextOverlay => ({
    ...createText({ id, text: label, fontSize: 40, color: '#fff', effect: 'none', visible: true, startFrame: 1, durationFrames: 30 }, { x: 10, y: 50 }),
    ...(parallax === undefined ? {} : { parallax }),
  });
  const withTexts = (texts: TextOverlay[]): SceneContent => ({ ...scene(zoom2), texts });
  const index = (calls: { name: string; args: unknown[] }[], pred: (c: { name: string; args: unknown[] }) => boolean) => calls.findIndex(pred);
  const zoomAt = (calls: { name: string; args: unknown[] }[], z: number) => calls.map((c, i) => (c.name === 'scale' && c.args[0] === z && c.args[1] === z ? i : -1)).filter((i) => i >= 0);

  it('pins an object with parallax 0 to the screen while the others follow the camera', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, withTexts([text('a', 'A'), text('b', 'B', 0)]));
    const fillA = index(calls, (c) => c.name === 'fillText' && c.args[0] === 'A');
    const fillB = index(calls, (c) => c.name === 'fillText' && c.args[0] === 'B');
    const zooms = zoomAt(calls, 2);
    expect(zooms).toHaveLength(1); // only the object that follows the camera
    expect(zooms[0]).toBeLessThan(fillA);
    expect(fillA).toBeLessThan(fillB);
  });
  it('gives a half-parallax layer half the zoom', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, withTexts([text('a', 'A', 0.5)]));
    expect(zoomAt(calls, 1.5)).toHaveLength(1);
    expect(zoomAt(calls, 2)).toHaveLength(0);
  });
  it('ignores parallax when the camera is off and keeps save/restore balanced', () => {
    const off = createCanvasStub();
    renderCompositeFrame(off.ctx, 1280, 720, 5, withTexts([text('a', 'A', 0.5)]), { camera: false });
    expect(zoomAt(off.calls, 1.5)).toHaveLength(0);
    const on = createCanvasStub();
    renderCompositeFrame(on.ctx, 1280, 720, 5, withTexts([text('a', 'A', 0.5), text('b', 'B', 0)]));
    const count = (n: string) => on.calls.filter((c) => c.name === n).length;
    expect(count('save')).toBe(count('restore'));
  });
  it('treats a broken factor as 1', () => {
    const { ctx, calls } = createCanvasStub();
    renderCompositeFrame(ctx, 1280, 720, 5, withTexts([text('a', 'A', NaN)]));
    expect(zoomAt(calls, 2)).toHaveLength(1);
  });
});
