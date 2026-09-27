import { describe, expect, it } from 'vitest';
import { retimeFrame, retimeScene, retimeSpan, retimeTrack, SceneData } from '../retime';
import { createActor, sampleActor, setActorProperty, toggleAnimated } from '../actor';
import { createChart } from '../overlays';

const seconds = (frame: number, fps: number) => (frame - 1) / fps;

function scene(): SceneData {
  let actor = createActor({ id: 'a', name: 'a', src: 'data:', width: 10, height: 10, x: 0, y: 0, startFrame: 25, durationFrames: 48 });
  actor = toggleAnimated(actor, 'position', 25);
  actor = setActorProperty(actor, 'position', 49, { x: 100, y: 0 }); // moves during second 1 → 2
  const chart = { ...createChart({ id: 'c', title: 'c', type: 'bar' as const, width: 10, height: 10, data: [], animationType: 'grow' as const, visible: true, startFrame: 1, durationFrames: 24 }, { x: 0, y: 0 }), animDurationFrames: 12 };
  return {
    frames: { 1: { frameNumber: 1, stickFigures: [], drawings: [] }, 13: { frameNumber: 13, stickFigures: [], drawings: [] } },
    charts: [chart],
    texts: [],
    images: [],
    actors: [actor],
    paths: [],
    layers: [],
    audio: [{ id: 'v', name: 'v', src: 'data:', sourceDuration: 5, startFrame: 49, offset: 0.5, duration: 3, volume: 1, muted: false }],
    markers: [{ id: 'm', frame: 73, label: '3s', color: '#fff' }],
  };
}

describe('retiming to another frame rate', () => {
  it('keeps frames at the same time', () => {
    expect(retimeFrame(25, 30 / 24)).toBe(31); // 1 s
    expect(seconds(retimeFrame(73, 60 / 24), 60)).toBeCloseTo(3);
    expect(retimeSpan(25, 48, 30 / 24)).toEqual({ startFrame: 31, durationFrames: 60 });
  });

  it('merges keys that land on the same frame (keeping the later one)', () => {
    const t = retimeTrack([{ frame: 1, value: 1 }, { frame: 2, value: 2 }, { frame: 3, value: 3 }], 0.5);
    expect(t).toEqual([{ frame: 1, value: 1 }, { frame: 2, value: 3 }]);
  });

  it('keeps the animation, audio and markers at the same seconds (24 → 30 fps)', () => {
    const { scene: s, totalFrames } = retimeScene(scene(), 96, 24, 30);
    expect(totalFrames).toBe(120);
    const actor = s.actors[0];
    // Halfway through the move (1.5 s) the actor is halfway along
    const mid = sampleActor(actor, retimeFrame(37, 30 / 24));
    expect(mid.x).toBeCloseTo(sampleActor(scene().actors[0], 37).x, 0);
    expect(actor.tracks.position!.map((k) => seconds(k.frame, 30))).toEqual([1, 2]);
    expect(s.charts[0].animDurationFrames).toBe(15);
    expect(seconds(s.audio![0].startFrame, 30)).toBeCloseTo(2);
    expect(s.audio![0].offset).toBe(0.5);
    expect(seconds(s.markers![0].frame, 30)).toBeCloseTo(3);
  });

  it('resamples frame-by-frame content and survives a round trip', () => {
    const { scene: s60, totalFrames: t60 } = retimeScene(scene(), 96, 24, 60);
    expect(Object.keys(s60.frames).length).toBeGreaterThan(2); // held poses are repeated
    const back = retimeScene(s60, t60, 60, 24);
    expect(back.totalFrames).toBe(96);
    expect(back.scene.actors[0].tracks.position!.map((k) => k.frame)).toEqual([25, 49]);
    expect(back.scene.markers![0].frame).toBe(73);
  });
});
