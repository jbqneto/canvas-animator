import { describe, expect, it } from 'vitest';
import { buildFollowProgress, distanceToPath, pointAtProgress, polylineUpTo, samplePath } from '../path';
import { sampleTrack } from '../keyframes';
import { createActor, sampleActor, trailPoints, actorKeyframes, shiftActorTime } from '../actor';
import type { MotionPath } from '../../types';

const makePath = (over: Partial<MotionPath> = {}): MotionPath => ({
  id: 'p1',
  name: 'Rota',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 300 },
  ],
  smooth: false,
  closed: false,
  style: { visible: true, color: '#fff', width: 3, stroke: 'dotted', reveal: 'full' },
  startFrame: 1,
  durationFrames: 100,
  ...over,
});

describe('path geometry', () => {
  it('measures length and the progress of each drawn point', () => {
    const s = samplePath(makePath());
    expect(s.length).toBeCloseTo(400);
    expect(s.anchorProgress).toEqual([0, 0.25, 1]);
  });

  it('progress is by distance and gives the travel direction', () => {
    const s = samplePath(makePath());
    expect(pointAtProgress(s, 0.125)).toMatchObject({ x: 50, y: 0, angle: 0 });
    const p = pointAtProgress(s, 0.625);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(150);
    expect(p.angle).toBeCloseTo(90);
  });

  it('smooth paths pass through every point', () => {
    const path = makePath({ smooth: true });
    const s = samplePath(path);
    s.anchorProgress.forEach((pr, i) => {
      const p = pointAtProgress(s, pr);
      expect(p.x).toBeCloseTo(path.points[i].x, 0);
      expect(p.y).toBeCloseTo(path.points[i].y, 0);
    });
  });

  it('closed paths come back to the first point', () => {
    const s = samplePath(makePath({ closed: true }));
    const end = pointAtProgress(s, 1);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(0);
    expect(s.anchorProgress).toHaveLength(4);
  });

  it('partial polyline and distance for picking', () => {
    const s = samplePath(makePath());
    const half = polylineUpTo(s, 0.25);
    expect(half[half.length - 1]).toEqual({ x: 100, y: 0 });
    expect(polylineUpTo(s, 0)).toEqual([]);
    expect(distanceToPath(s, { x: 50, y: 10 })).toBeCloseTo(10);
  });
});

describe('buildFollowProgress', () => {
  it('without stops is a single eased move', () => {
    const t = buildFollowProgress({ anchorProgress: [0, 0.25, 1], startFrame: 1, endFrame: 51, easing: 'easeInOut', holdFrames: 0 });
    expect(t).toEqual([
      { frame: 1, value: 0, easing: 'easeInOut' },
      { frame: 51, value: 1 },
    ]);
  });

  it('with stops holds at each intermediate point and splits time by length', () => {
    const t = buildFollowProgress({ anchorProgress: [0, 0.25, 1], startFrame: 1, endFrame: 111, easing: 'linear', holdFrames: 10 });
    // 110 frames - 10 hold = 100 travel: 25 for the first leg, 75 for the second
    expect(t.map((k) => [k.frame, k.value])).toEqual([
      [1, 0],
      [26, 0.25],
      [36, 0.25],
      [111, 1],
    ]);
    expect(sampleTrack(t, 30, 0)).toBe(0.25);
  });
});

describe('actor following a path', () => {
  const path = makePath();
  const actor = {
    ...createActor({ id: 'a', name: 'img', src: '', width: 10, height: 10, x: 999, y: 999, startFrame: 1, durationFrames: 100 }),
    follow: {
      pathId: 'p1',
      orient: true,
      progress: [
        { frame: 1, value: 0, easing: 'linear' as const },
        { frame: 41, value: 1 },
      ],
    },
  };

  it('takes its position and rotation from the path', () => {
    const s = sampleActor(actor, 26, [path]); // progress 0.625
    expect(s.x).toBeCloseTo(100);
    expect(s.y).toBeCloseTo(150);
    expect(s.rotation).toBeCloseTo(90);
  });

  it('falls back to its own position when the path is missing', () => {
    expect(sampleActor(actor, 26, [])).toMatchObject({ x: 999, y: 999 });
  });

  it('follows edits of the path (live link)', () => {
    const moved = makePath({ points: path.points.map((p) => ({ x: p.x + 10, y: p.y })) });
    expect(sampleActor(actor, 1, [moved]).x).toBeCloseTo(10);
  });

  it('progress keys are actor keys (timeline, shift) and the trail is the travelled path', () => {
    expect(actorKeyframes(actor)).toEqual([1, 41]);
    expect(actorKeyframes(shiftActorTime(actor, 5))).toEqual([6, 46]);
    const trail = trailPoints(actor, 11, [path]); // progress 0.25
    expect(trail[trail.length - 1].x).toBeCloseTo(100);
    expect(trail[trail.length - 1].y).toBeCloseTo(0);
  });
});
