import { describe, expect, it } from 'vitest';
import { lintScene, type LintInput } from '../lint';
import { createText } from '../overlays';
import type { ActorOverlay, TextOverlay } from '../../types';

const text = (over: Partial<TextOverlay> = {}, at = { x: 400, y: 500 }) =>
  createText(
    { id: 't1', text: 'Hello', fontSize: 60, color: '#ffffff', effect: 'none', visible: true, startFrame: 1, durationFrames: 30, ...over },
    at
  );
const input = (texts: TextOverlay[], over: Partial<LintInput> = {}): LintInput => ({
  fps: 24, totalFrames: 60, canvas: { width: 1920, height: 1080 }, videoBg: { color: '#000000' }, content: { texts }, ...over,
});
const rules = (i: LintInput) => lintScene(i).map((x) => x.rule);

describe('lintScene', () => {
  it('is quiet for a clean scene and for an empty one', () => {
    expect(lintScene(input([text()]))).toEqual([]);
    expect(lintScene(input([]))).toEqual([]);
    expect(lintScene({ ...input([]), content: {} })).toEqual([]);
  });
  it('flags text smaller than 34 px at 1080p, scaled to the canvas height', () => {
    expect(rules(input([text({ fontSize: 20 })]))).toContain('text-too-small');
    expect(rules(input([text({ fontSize: 34 })]))).not.toContain('text-too-small');
    const small = input([text({ fontSize: 24 })], { canvas: { width: 1280, height: 720 } });
    expect(rules(small)).not.toContain('text-too-small'); // 34 * 720/1080 = 22.7
  });
  it('flags empty text but not number counters', () => {
    expect(rules(input([text({ text: '  ' })]))).toContain('text-empty');
    expect(rules(input([text({ text: '', isNumberCounter: true })]))).not.toContain('text-empty');
  });
  it('flags objects that run past, or start after, the end of the timeline', () => {
    const past = lintScene(input([text({ startFrame: 50, durationFrames: 30 })]));
    expect(past.find((x) => x.rule === 'beyond-timeline')?.severity).toBe('warning');
    const after = lintScene(input([text({ startFrame: 70 })]));
    expect(after.find((x) => x.rule === 'beyond-timeline')?.severity).toBe('error');
  });
  it('flags text outside the safe area', () => {
    expect(rules(input([text({}, { x: 5, y: 500 })]))).toContain('outside-safe-area');
    expect(rules(input([text({}, { x: 400, y: 1075 })]))).toContain('outside-safe-area');
  });
  it('flags low contrast against the background, ignoring non-hex colors', () => {
    expect(rules(input([text({ color: '#222222' })]))).toContain('low-contrast');
    expect(rules(input([text({ color: 'red' })]))).not.toContain('low-contrast');
    expect(rules(input([text({ color: '#222222', bgColor: '#ffffff' })]))).not.toContain('low-contrast');
  });
  it('reports the object id', () => {
    expect(lintScene(input([text({ id: 'abc', fontSize: 10 })]))[0].objectId).toBe('abc');
  });

  it('accepts spaced uppercase labels at 24 px (1080p) but not smaller, mixed-case or unspaced ones', () => {
    const label = (over: Partial<TextOverlay>) => text({ text: 'CAMPO GRANDE', fontSize: 24, letterSpacing: 10, ...over });
    expect(rules(input([label({})]))).not.toContain('text-too-small');
    expect(rules(input([label({ fontSize: 20 })]))).toContain('text-too-small');
    expect(rules(input([label({ text: 'Campo Grande' })]))).toContain('text-too-small');
    expect(rules(input([label({ letterSpacing: 0 })]))).toContain('text-too-small');
  });
  it('flags text that is blurred for its whole span, not a blur-in that clears', () => {
    const stuck = text({ effects: { shadowOpacity: 0, shadowBlur: 8, shadowX: 0, shadowY: 4, shadowColor: '#000000', glowRadius: 0, glowStrength: 1, glowColor: '#ffffff', blur: 6, tintAmount: 0, tintColor: '#ff0000' } });
    expect(rules(input([stuck]))).toContain('blurred-text');
    const blurIn = text({ tracks: { blur: [{ frame: 1, value: 12 }, { frame: 20, value: 0 }] } as any });
    expect(rules(input([blurIn]))).not.toContain('blurred-text');
    expect(rules(input([text()]))).not.toContain('blurred-text');
  });
  it('flags long dead air over a plain background but not over a video or short gaps', () => {
    const early = text({ startFrame: 1, durationFrames: 10 });
    const late = text({ id: 't2', startFrame: 100, durationFrames: 10 });
    const wide = { totalFrames: 120 };
    expect(rules(input([early, late], wide))).toContain('dead-air');
    expect(rules(input([early, late], { ...wide, videoBg: { type: 'upload' } }))).not.toContain('dead-air');
    expect(rules(input([text({ durationFrames: 60 }), text({ id: 't2', startFrame: 61, durationFrames: 59 })], wide))).not.toContain('dead-air');
    expect(rules(input([text({ durationFrames: 10 })], wide))).toContain('dead-air'); // trailing gap
  });
  it('flags a scene where every text uses the same entrance, once there are enough texts', () => {
    const same = (n: number) => Array.from({ length: n }, (_, i) => text({ id: `t${i}`, effect: 'fadeRise' as any }));
    expect(rules(input(same(4)))).toContain('uniform-entrance');
    expect(rules(input(same(3)))).not.toContain('uniform-entrance');
    expect(rules(input([...same(4), text({ id: 'x', effect: 'typewriter' as any })]))).not.toContain('uniform-entrance');
  });
  it('ignores maskOnly actors for dead air, since they are never drawn', () => {
    const wide = { totalFrames: 120 };
    const ghost = { id: 'm1', name: 'Mask', kind: 'shape', src: '', width: 10, height: 10, flipX: false, startFrame: 1, durationFrames: 120, maskOnly: true,
      shape: { type: 'rect', fill: '#fff', stroke: '#000', strokeWidth: 0, radius: 0 } } as ActorOverlay;
    const i = input([text({ durationFrames: 10 })], { ...wide, content: { texts: [text({ durationFrames: 10 })], actors: [ghost] } });
    expect(rules(i)).toContain('dead-air');
    const shown = { ...ghost, maskOnly: undefined } as ActorOverlay;
    expect(rules({ ...i, content: { ...i.content, actors: [shown] } })).not.toContain('dead-air');
  });
  describe('masks', () => {
    const shape = (over: Partial<ActorOverlay> = {}) =>
      ({ id: 'm1', name: 'Mask', kind: 'shape', src: '', width: 100, height: 100, flipX: false, startFrame: 1, durationFrames: 60, maskOnly: true,
        shape: { type: 'rect', fill: '#fff', stroke: '#000', strokeWidth: 0, radius: 0 }, ...over }) as ActorOverlay;
    const masked = (actors: ActorOverlay[], mask: any = { actorId: 'm1', mode: 'inside' }, over: Partial<TextOverlay> = {}) =>
      input([text({ mask, ...over } as any)], { content: { texts: [text({ mask, ...over } as any)], actors } });
    const issues = (i: LintInput, rule: string) => lintScene(i).filter((x) => x.rule === rule);

    it('flags a mask pointing at a missing id, an image, a line or the object itself', () => {
      const missing = issues(masked([]), 'mask-missing');
      expect(missing).toHaveLength(1);
      expect(missing[0]).toMatchObject({ severity: 'error', objectId: 't1' });
      expect(missing[0].message).toContain('m1');
      expect(issues(masked([shape({ kind: 'image', shape: undefined })]), 'mask-missing')).toHaveLength(1);
      expect(issues(masked([shape({ shape: { type: 'line', fill: '#fff', stroke: '#000', strokeWidth: 2, radius: 0 } })]), 'mask-missing')).toHaveLength(1);
      expect(issues(masked([shape()], { actorId: 't1', mode: 'inside' }), 'mask-missing')).toHaveLength(1);
    });
    it('flags a mask with an invalid mode, which renders whole', () => {
      expect(issues(masked([shape()], { actorId: 'm1', mode: 'sideways' }), 'mask-missing')).toHaveLength(1);
      expect(issues(masked([shape()], { actorId: 'm1', mode: 'outside' }), 'mask-missing')).toHaveLength(0);
    });
    it('accepts rect, ellipse and arrow masks and objects without a mask', () => {
      for (const type of ['rect', 'ellipse', 'arrow'] as const) {
        const s = shape({ shape: { type, fill: '#fff', stroke: '#000', strokeWidth: 0, radius: 0 } });
        expect(issues(masked([s]), 'mask-missing')).toHaveLength(0);
      }
      expect(rules(input([text()]))).not.toContain('mask-missing');
    });
    it('warns when the mask does not cover the whole span of the object', () => {
      const short = issues(masked([shape({ durationFrames: 10 })]), 'mask-span');
      expect(short).toHaveLength(1);
      expect(short[0]).toMatchObject({ severity: 'warning', objectId: 't1' });
      expect(short[0].message).toContain('m1');
      expect(issues(masked([shape({ startFrame: 10 })]), 'mask-span')).toHaveLength(1);
      expect(issues(masked([shape()]), 'mask-span')).toHaveLength(0);
      expect(issues(masked([]), 'mask-span')).toHaveLength(0);
    });
  });
});
