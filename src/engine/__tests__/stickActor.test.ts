import { describe, expect, it } from 'vitest';
import type { FrameData, StickFigure } from '../../types';
import { createDefaultStickFigure, applyPoseToStickFigure } from '../../utils/stickFigurePresets';
import { tweenStickFrames } from '../stickRig';
import {
  createStickActor,
  migrateFrameSticks,
  moveStickKeys,
  poseBox,
  samplePose,
  setPose,
  shiftStickTime,
  simplifySeries,
  stickToStrokes,
  togglePoseTrack,
  withStickLayers,
  mirrorPose,
  applyPose,
  stickKeyframes,
  togglePoseKey,
  worldFigure,
} from '../stickActor';
import { sampleActor } from '../actor';

const fig = (over: Partial<StickFigure> = {}) => ({ ...createDefaultStickFigure('s', 'Zé', 100, 200), ...over });
const frame = (n: number, sticks: StickFigure[]): FrameData => ({ frameNumber: n, stickFigures: sticks, drawings: [] });

describe('stick actor poses', () => {
  it('uses the rest pose until the stopwatch is on, then keys at the current frame', () => {
    let s = createStickActor(fig(), 1, 48);
    const raised = { ...s.joints, rHand: { ...s.joints.rHand, y: -120 } };
    s = setPose(s, 10, raised);
    expect(s.poses).toEqual([]);
    expect(samplePose(s, 30).rHand.y).toBe(-120);
    s = togglePoseKey(s, 1); // stopwatch on with the current pose
    s = setPose(s, 25, { ...raised, rHand: { ...raised.rHand, y: 0 } });
    expect(stickKeyframes(s)).toEqual([1, 25]);
    // In between, the arm is interpolated bone by bone (the hand swings, the elbow stays)
    const mid = samplePose(s, 13);
    expect(mid.rHand.y).toBeGreaterThan(-120);
    expect(mid.rHand.y).toBeLessThan(0);
    expect(mid.rElbow.x).toBeCloseTo(s.joints.rElbow.x, 6);
    expect(mid.rElbow.y).toBeCloseTo(s.joints.rElbow.y, 6);
    expect(samplePose(s, 40).rHand.y).toBe(0);
  });

  it('removing the last key keeps the pose that was showing', () => {
    let s = togglePoseKey(createStickActor(fig(), 1, 10), 5);
    s = setPose(s, 5, { ...s.joints, head: { ...s.joints.head, x: 9 } });
    s = togglePoseKey(s, 5);
    expect(s.poses).toEqual([]);
    expect(s.joints.head.x).toBe(9);
  });

  it('moves and shifts pose keys with the transform keys', () => {
    let s = togglePoseKey(createStickActor(fig(), 1, 48), 10);
    s = shiftStickTime(s, 5);
    expect(s.poses.map((k) => k.frame)).toEqual([15]);
    s = moveStickKeys(s, 15, 20);
    expect(stickKeyframes(s)).toEqual([20]);
  });

  it('places the figure with the animated transform', () => {
    const s = createStickActor(fig({ scale: 1.5 }), 1, 10);
    expect(worldFigure(s, 5)).toMatchObject({ x: 100, y: 200, scale: 1.5 });
    expect(poseBox(s, 5).height).toBeGreaterThan(200);
  });
});

describe('stick actor helpers', () => {
  it('stopwatch off keeps the pose seen at that frame as the rest pose', () => {
    let s = togglePoseTrack(createStickActor(fig(), 1, 20), 1);
    expect(s.poses.map((k) => k.frame)).toEqual([1]);
    s = setPose(s, 10, { ...s.joints, head: { ...s.joints.head, y: -999 } });
    s = togglePoseTrack(s, 10);
    expect(s.poses).toEqual([]);
    expect(s.joints.head.y).toBe(-999);
  });

  it('breaks the figure into strokes with its whole transform applied', () => {
    let s = createStickActor(fig({ scale: 2 }), 1, 10);
    s = { ...s, base: { ...s.base, rotation: 90 } };
    const strokes = stickToStrokes(s, 1, 'x');
    expect(strokes[0].tool).toBe('circle');
    expect(strokes.filter((k) => k.tool === 'line')).toHaveLength(s.bones.length);
    // Rotated 90° clockwise (canvas y points down): local (x, y) lands at anchor + (-y, x) · scale
    const head = s.joints.head;
    const [tl, br] = strokes[0].points;
    expect((tl.x + br.x) / 2).toBeCloseTo(100 - head.y * 2, 0);
    expect((tl.y + br.y) / 2).toBeCloseTo(200 + head.x * 2, 0);
    expect(br.x - tl.x).toBe(2 * (head.radius ?? 20) * 2);
    expect(strokes[0].thickness).toBe(s.thickness * 2);
  });

  it('adds a layer only for figures without one', () => {
    const s = createStickActor(fig(), 1, 10);
    const layers = withStickLayers([], [s]);
    expect(layers.map((l) => [l.type, l.targetId])).toEqual([['group', 's']]);
    expect(withStickLayers(layers, [s])).toBe(layers);
  });
});

describe('mirror and saved poses', () => {
  it('mirrors around the anchor, swapping left and right and turning the face', () => {
    const pose = applyPoseToStickFigure(fig(), 'wave').joints;
    const m = mirrorPose(pose);
    expect(m.lHand).toMatchObject({ id: 'lHand', x: -pose.rHand.x, y: pose.rHand.y });
    expect(m.rHand).toMatchObject({ id: 'rHand', x: -pose.lHand.x, y: pose.lHand.y });
    expect(m.head.x).toBe(-pose.head.x);
    expect(m.head.facing).toBe(-1);
    expect(mirrorPose(m)).toEqual({ ...pose, head: { ...pose.head, facing: 1 } });
  });

  it('the face turns halfway between a pose and its mirror', () => {
    let s = togglePoseKey(createStickActor(fig(), 1, 20), 1);
    s = setPose(s, 11, mirrorPose(s.joints));
    expect(samplePose(s, 5).head.facing ?? 1).toBe(1);
    expect(samplePose(s, 7).head.facing).toBe(-1);
  });

  it('applies a saved pose only to the joints the figure has', () => {
    const current = fig().joints;
    const out = applyPose(current, { rHand: { id: 'rHand', x: 1, y: 2 }, tail: { id: 'tail', x: 9, y: 9 } });
    expect(out.rHand).toMatchObject({ x: 1, y: 2 });
    expect(out.tail).toBeUndefined();
    expect(out.lHand).toEqual(current.lHand);
  });
});

describe('migration from one copy per frame', () => {
  it('keeps hand poses as keys, in-betweens as an eased segment and holds as hold', () => {
    const a = applyPoseToStickFigure(fig(), 'stand');
    const b = applyPoseToStickFigure(fig(), 'wave');
    const tweens = tweenStickFrames(a, b, 1, 5, 'linear');
    const frames: Record<number, FrameData> = {
      1: frame(1, [a]),
      2: frame(2, [tweens[2]]),
      3: frame(3, [tweens[3]]),
      4: frame(4, [tweens[4]]),
      5: frame(5, [b]),
      6: frame(6, [b]),
      7: frame(7, [a]),
      8: frame(8, [{ ...a, id: 'other' }]),
    };
    const { sticks, frames: cleaned } = migrateFrameSticks(frames);
    expect(Object.values(cleaned).every((f) => f.stickFigures.length === 0)).toBe(true);
    const s = sticks.find((x) => x.id === 's')!;
    expect(s.startFrame).toBe(1);
    expect(s.startFrame + s.durationFrames).toBe(7);
    expect(s.poses.map((k) => [k.frame, k.easing])).toEqual([
      [1, 'easeInOut'],
      [5, 'hold'],
      [7, 'hold'],
    ]);
    expect(samplePose(s, 6)).toEqual(b.joints); // held
    expect(sticks.find((x) => x.id === 'other')!.poses).toEqual([]);
  });

  it('turns a walk across the stage into a few position keys', () => {
    const frames: Record<number, FrameData> = {};
    for (let f = 1; f <= 20; f++) frames[f] = frame(f, [fig({ x: 100 + f * 10, y: 300 })]);
    frames[21] = frame(21, [fig({ x: 310, y: 250 })]);
    const [s] = migrateFrameSticks(frames).sticks;
    expect(s.tracks.position!.map((k) => k.frame)).toEqual([1, 20, 21]);
    expect(sampleActor(s, 10)).toMatchObject({ x: 200, y: 300 });
    expect(s.tracks.scale).toBeUndefined();
  });

  it('simplifies a series within tolerance', () => {
    const pts = [0, 1, 2, 3, 10].map((v, i) => ({ frame: i + 1, value: [v] }));
    expect(simplifySeries(pts)).toEqual([1, 4, 5]);
  });
});
