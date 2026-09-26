import { describe, expect, it } from 'vitest';
import { buildRouteKeyframes, buildStopLabels } from '../routeTemplate';
import { samplePosition, sampleTrack } from '../../engine/keyframes';

const stops = [
  { name: 'Brasil', x: 400, y: 500 },
  { name: 'Portugal', x: 600, y: 250 },
  { name: 'Japão', x: 1100, y: 280 },
];
const timing = { fps: 24, secondsPerLeg: 2, pauseSeconds: 1, landedScale: 0.7 };

describe('route template', () => {
  it('lands on every stop and pauses there', () => {
    const r = buildRouteKeyframes(stops, timing);
    // 3 pauses of 24 frames + 2 legs of 48 frames, starting at frame 1
    expect(r.arrivals).toEqual([1, 73, 145]);
    expect(r.endFrame).toBe(169);
    for (const [i, f] of r.arrivals.entries()) {
      for (const at of [f, f + 12, f + 24]) {
        const p = samplePosition(r.position, at, { x: 0, y: 0 }, true);
        expect(p.x).toBeCloseTo(stops[i].x);
        expect(p.y).toBeCloseTo(stops[i].y);
      }
    }
  });

  it('keeps flying heading while landed (orient-to-path does not snap)', () => {
    const r = buildRouteKeyframes(stops, timing);
    const arriving = samplePosition(r.position, 72, { x: 0, y: 0 }, true).angle;
    const landed = samplePosition(r.position, 80, { x: 0, y: 0 }, true).angle;
    expect(Math.abs(landed - arriving)).toBeLessThan(15);
  });

  it('shrinks when landed and is full size mid-flight', () => {
    const r = buildRouteKeyframes(stops, timing);
    expect(sampleTrack(r.scale, 10, 1)).toBeCloseTo(0.7);
    expect(sampleTrack(r.scale, 49, 1)).toBeCloseTo(1);
  });

  it('arcs bend each leg upwards and keep the stops', () => {
    const r = buildRouteKeyframes(stops, { ...timing, arc: 0.2 });
    expect(r.arrivals).toEqual([1, 73, 145]);
    // Brasil -> Portugal goes up-right; the middle of the flight is above the straight line
    const mid = samplePosition(r.position, 49, { x: 0, y: 0 }, true);
    expect(mid.y).toBeLessThan((500 + 250) / 2 - 10);
    const landed = samplePosition(r.position, 80, { x: 0, y: 0 }, true);
    expect(landed.x).toBeCloseTo(600);
    // continuous speed through the arc apex: no stop in the middle of the leg
    const step = (f: number) => {
      const a = samplePosition(r.position, f, { x: 0, y: 0 }, true);
      const b = samplePosition(r.position, f + 1, { x: 0, y: 0 }, true);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(step(49)).toBeGreaterThan(step(30) * 0.5);
  });

  it('labels appear on arrival and stay until the end', () => {
    const r = buildRouteKeyframes(stops, timing);
    const labels = buildStopLabels(stops, r.arrivals, r.endFrame, 1280, 'rt');
    expect(labels.map((l) => l.startFrame)).toEqual([1, 73, 145]);
    expect(labels[1].startFrame + labels[1].durationFrames).toBe(169);
    expect(labels[0].text).toBe('Brasil');
  });
});
