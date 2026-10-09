import { describe, expect, it } from 'vitest';
import {
  addCameraMove, applyCamera, clampZoom, DEFAULT_CAMERA, isIdentityCamera, sampleCamera, sceneToScreen, screenToScene,
} from '../camera';
import { createCanvasStub } from '../../test/canvasStub';

describe('sampleCamera', () => {
  it('is the identity without a camera', () => {
    expect(isIdentityCamera(sampleCamera(undefined, 10))).toBe(true);
    expect(isIdentityCamera(sampleCamera(DEFAULT_CAMERA, 10))).toBe(true);
  });
  it('interpolates a keyframed zoom', () => {
    const cam = addCameraMove(undefined, { property: 'zoom', from: 1, to: 1.2, startFrame: 1, endFrame: 101, easing: 'linear' });
    expect(sampleCamera(cam, 1).zoom).toBeCloseTo(1);
    expect(sampleCamera(cam, 51).zoom).toBeCloseTo(1.1);
    expect(sampleCamera(cam, 101).zoom).toBeCloseTo(1.2);
    expect(sampleCamera(cam, 500).zoom).toBeCloseTo(1.2);
  });
  it('limits absurd zoom values', () => {
    expect(clampZoom(0)).toBe(0.05);
    expect(clampZoom(-4)).toBe(0.05);
    expect(clampZoom(1e9)).toBe(20);
    expect(clampZoom(Number.NaN)).toBe(1);
    const bad = { base: { panX: Number.NaN, panY: 0, zoom: 0, rotation: Infinity }, tracks: {} };
    expect(sampleCamera(bad, 1)).toEqual({ panX: 0, panY: 0, zoom: 0.05, rotation: 0 });
  });
});

describe('applyCamera', () => {
  it('translates to the center, rotates, scales and translates back by the pan', () => {
    const { ctx, calls } = createCanvasStub();
    applyCamera(ctx, { panX: 10, panY: -20, zoom: 2, rotation: 90 }, 1000, 500);
    expect(calls).toEqual([
      { name: 'translate', args: [500, 250] },
      { name: 'rotate', args: [Math.PI / 2] },
      { name: 'scale', args: [2, 2] },
      { name: 'translate', args: [-510, -230] },
    ]);
  });
});

describe('sceneToScreen / screenToScene', () => {
  const state = { panX: 40, panY: -30, zoom: 1.7, rotation: 25 };
  it('round-trips a point', () => {
    const p = { x: 321, y: 123 };
    const back = screenToScene(state, sceneToScreen(state, p, 1920, 1080), 1920, 1080);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
  it('puts the looked-at point at the screen center', () => {
    const s = sceneToScreen({ panX: 100, panY: 50, zoom: 3, rotation: 0 }, { x: 1060, y: 590 }, 1920, 1080);
    expect(s).toEqual({ x: 960, y: 540 });
  });
});
