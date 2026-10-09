import { describe, expect, it } from 'vitest';
import { lintScene, type LintInput } from '../lint';
import { createText } from '../overlays';
import type { TextOverlay } from '../../types';

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
});
