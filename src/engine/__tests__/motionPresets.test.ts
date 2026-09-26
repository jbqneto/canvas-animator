import { describe, expect, it } from 'vitest';
import { applyEntrance, applyExit } from '../motionPresets';
import { createActor, sampleActor, setActorProperty } from '../actor';

const actor = () =>
  createActor({ id: 'a', name: 'a', src: 'data:', width: 10, height: 10, x: 100, y: 100, startFrame: 11, durationFrames: 40 });

describe('motion presets', () => {
  it('fade in and out around the resting opacity', () => {
    const a = applyExit(applyEntrance(actor(), 'fade', { frames: 10 }), 'fade', { frames: 10 });
    expect(sampleActor(a, 11).opacity).toBeCloseTo(0);
    expect(sampleActor(a, 21).opacity).toBeCloseTo(1);
    expect(sampleActor(a, 35).opacity).toBeCloseTo(1);
    expect(sampleActor(a, 51).opacity).toBeCloseTo(0);
  });

  it('slides in from below to the resting position, and out to the left', () => {
    const a = applyExit(applyEntrance(actor(), 'slideUp', { frames: 10, distance: 50 }), 'slideLeft', {
      frames: 10,
      distance: 80,
    });
    expect(sampleActor(a, 11)).toMatchObject({ x: 100, y: 150, opacity: 0 });
    expect(sampleActor(a, 21)).toMatchObject({ x: 100, y: 100 });
    expect(sampleActor(a, 41)).toMatchObject({ x: 100, y: 100 });
    expect(sampleActor(a, 51).x).toBeCloseTo(20);
  });

  it('pops from zero to the current scale', () => {
    const scaled = setActorProperty(actor(), 'scale', 11, 2);
    const a = applyEntrance(scaled, 'pop', { frames: 8 });
    expect(sampleActor(a, 11).scale).toBeCloseTo(0);
    expect(sampleActor(a, 19).scale).toBeCloseTo(2);
  });

  it('keeps existing keys and never runs past a short span', () => {
    let a = { ...actor(), durationFrames: 6 };
    a = applyEntrance(a, 'fade', { frames: 30 });
    expect(a.tracks.opacity!.map((k) => k.frame)).toEqual([11, 14]);
  });
});
