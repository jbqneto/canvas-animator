import { describe, expect, it } from 'vitest';
import { buildRouteTemplate, buildStopLabels, routeDurationFrames, routePoints } from '../routeTemplate';
import { sampleTrack } from '../../engine/keyframes';
import { createActor, sampleActor } from '../../engine/actor';

const stops = [
  { name: 'Brasil', x: 400, y: 500 },
  { name: 'Portugal', x: 600, y: 250 },
  { name: 'Japão', x: 1100, y: 280 },
];
const timing = { fps: 24, secondsPerLeg: 2, pauseSeconds: 1, landedScale: 0.7, arc: 0.2 };

const follower = (t: ReturnType<typeof buildRouteTemplate>) => ({
  ...createActor({ id: 'v', name: 'v', src: '', width: 10, height: 10, x: 0, y: 0, startFrame: 1, durationFrames: t.endFrame }),
  follow: t.follow,
  tracks: { scale: t.scale },
});

describe('route template (built on motion paths)', () => {
  it('adds one arc point per leg and remembers which points are stops', () => {
    const { points, stopIndices } = routePoints(stops, 0.2);
    expect(points).toHaveLength(5);
    expect(stopIndices).toEqual([0, 2, 4]);
    expect(points[1].y).toBeLessThan((500 + 250) / 2); // bends upwards
    expect(routePoints(stops, 0).points).toHaveLength(3);
  });

  it('the follower waits at every stop (not at arc points) and ends at the last one', () => {
    const t = buildRouteTemplate(stops, timing, 'route');
    expect(t.endFrame).toBe(routeDurationFrames(3, timing));
    expect(t.endFrame).toBe(1 + 24 * 3 + 48 * 2);
    const a = follower(t);
    t.arrivals.forEach((f, i) => {
      for (const at of [f, f + 12]) {
        const s = sampleActor(a, at, [t.path]);
        expect(s.x).toBeCloseTo(stops[i].x, 0);
        expect(s.y).toBeCloseTo(stops[i].y, 0);
      }
    });
    // only the 3 stops are holds: first wait, one intermediate hold, last wait
    const holds = t.follow.progress.filter((k, i, arr) => i > 0 && arr[i - 1].value === k.value);
    expect(holds).toHaveLength(1);
  });

  it('shrinks when landed and is full size mid-flight; the path reveals as it travels', () => {
    const t = buildRouteTemplate(stops, timing, 'route');
    expect(sampleTrack(t.scale, 5, 1)).toBeCloseTo(0.7);
    const midFlight = Math.round((t.arrivals[0] + 24 + t.arrivals[1]) / 2);
    expect(sampleTrack(t.scale, midFlight, 1)).toBeCloseTo(1);
    expect(t.path.style.reveal).toBe('follow');
  });

  it('labels appear on arrival and stay until the end', () => {
    const t = buildRouteTemplate(stops, timing, 'route');
    const labels = buildStopLabels(stops, t.arrivals, t.endFrame, 1280, 'rt');
    expect(labels[0].startFrame).toBe(1);
    expect(labels[1].startFrame).toBe(t.arrivals[1]);
    expect(labels[2].startFrame + labels[2].durationFrames).toBe(t.endFrame);
  });
});
