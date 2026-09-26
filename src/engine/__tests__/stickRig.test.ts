import { describe, expect, it } from 'vitest';
import { createDefaultStickFigure, applyPoseToStickFigure } from '../../utils/stickFigurePresets';
import { descendantsOf, dragJointFK, interpolateStickPose, jointParents, tweenStickFrames } from '../stickRig';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('stick rig', () => {
  const stick = createDefaultStickFigure('s', 'S', 0, 0);

  it('builds the hierarchy from bones and attaches the head to the neck', () => {
    const parents = jointParents(stick);
    expect(parents.rHand).toBe('rElbow');
    expect(parents.head).toBe('neck');
    expect(descendantsOf(stick, 'rShoulder').sort()).toEqual(['rElbow', 'rHand']);
  });

  it('FK drag rotates the chain around the parent and keeps bone lengths', () => {
    const before = stick.joints;
    const moved = dragJointFK(stick, 'rElbow', { x: 16, y: -120 }); // raise the arm
    const j = moved.joints;
    expect(dist(j.rElbow, j.rShoulder)).toBeCloseTo(dist(before.rElbow, before.rShoulder));
    expect(dist(j.rHand, j.rElbow)).toBeCloseTo(dist(before.rHand, before.rElbow));
    expect(j.rShoulder).toEqual(before.rShoulder);
    expect(j.rElbow.y).toBeLessThan(before.rShoulder.y); // arm now points up
    expect(j.lHand).toEqual(before.lHand); // other limbs untouched
  });

  it('interpolation keeps limb lengths constant mid-way (no shrinking)', () => {
    const a = applyPoseToStickFigure(stick, 'stand');
    const b = dragJointFK(a, 'rShoulder', { x: 60, y: -100 });
    const mid = interpolateStickPose(a, b, 0.5);
    const len = (s: typeof a) => dist(s.joints.rElbow, s.joints.rShoulder);
    expect(len(mid)).toBeCloseTo(len(a), 5);
    // ends match the key poses
    const end = interpolateStickPose(a, b, 1);
    expect(end.joints.rHand.x).toBeCloseTo(b.joints.rHand.x);
    expect(end.joints.rHand.y).toBeCloseTo(b.joints.rHand.y);
  });

  it('tweenStickFrames fills only the in-between frames and marks them', () => {
    const a = { ...stick, x: 0 };
    const b = { ...stick, x: 100 };
    const out = tweenStickFrames(a, b, 10, 15, 'linear');
    expect(Object.keys(out).map(Number)).toEqual([11, 12, 13, 14]);
    expect(out[12].x).toBeCloseTo(40);
    expect(out[12].tweened).toBe(true);
  });
});
