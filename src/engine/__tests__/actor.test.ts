import { describe, expect, it } from 'vitest';
import {
  actorKeyframes,
  createActor,
  hitTestActor,
  sampleActor,
  setActorProperty,
  toggleAnimated,
} from '../actor';

const plane = () =>
  createActor({ id: 'a', name: 'avião', src: '', width: 100, height: 50, x: 0, y: 0, startFrame: 1, durationFrames: 100 });

describe('actor', () => {
  it('edits the base value while a property is not animated', () => {
    const a = setActorProperty(plane(), 'position', 30, { x: 10, y: 20 });
    expect(a.base.x).toBe(10);
    expect(a.tracks.position).toBeUndefined();
    expect(sampleActor(a, 99)).toMatchObject({ x: 10, y: 20 });
  });

  it('stopwatch on: edits create keys at the current frame', () => {
    let a = toggleAnimated(plane(), 'position', 1);
    a = setActorProperty(a, 'position', 11, { x: 100, y: 0 });
    expect(actorKeyframes(a)).toEqual([1, 11]);
    expect(sampleActor(a, 11).x).toBeCloseTo(100);
    expect(sampleActor(a, 6).x).toBeGreaterThan(0);
  });

  it('stopwatch off keeps the value at the current frame', () => {
    let a = toggleAnimated(plane(), 'scale', 1);
    a = setActorProperty(a, 'scale', 10, 3);
    a = toggleAnimated(a, 'scale', 10);
    expect(a.tracks.scale).toEqual([]);
    expect(a.base.scale).toBe(3);
  });

  it('orient to path adds the travel direction to rotation', () => {
    let a = toggleAnimated(plane(), 'position', 1);
    a = setActorProperty(a, 'position', 11, { x: 0, y: 100 });
    expect(sampleActor(a, 5).rotation).toBe(0);
    a = { ...a, orientToPath: true, smoothPath: false };
    expect(sampleActor(a, 5).rotation).toBeCloseTo(90);
  });

  it('is visible only inside its time span', () => {
    const a = { ...plane(), startFrame: 10, durationFrames: 5 };
    expect(sampleActor(a, 9).visible).toBe(false);
    expect(sampleActor(a, 15).visible).toBe(true);
    expect(sampleActor(a, 16).visible).toBe(false);
  });

  it('hit tests in rotated/scaled local space', () => {
    let a = setActorProperty(plane(), 'rotation', 1, 90);
    expect(hitTestActor(a, 1, { x: 0, y: 45 })).toBe(true); // along the rotated long side
    expect(hitTestActor(a, 1, { x: 45, y: 0 })).toBe(false);
    a = setActorProperty(a, 'scale', 1, 2);
    expect(hitTestActor(a, 1, { x: 0, y: 95 })).toBe(true);
  });
});

describe('actor timing', () => {
  it('moveActorKeys retimes keys of every property at that frame', async () => {
    const { moveActorKeys, shiftActorTime } = await import('../actor');
    let a = toggleAnimated(plane(), 'position', 1);
    a = toggleAnimated(a, 'opacity', 10);
    a = setActorProperty(a, 'position', 10, { x: 5, y: 5 });
    a = moveActorKeys(a, 10, 20);
    expect(actorKeyframes(a)).toEqual([1, 20]);
    a = shiftActorTime(a, 5);
    expect(actorKeyframes(a)).toEqual([6, 25]);
    expect(a.startFrame).toBe(6);
  });
});
