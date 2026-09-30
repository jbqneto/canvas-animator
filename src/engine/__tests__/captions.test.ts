import { describe, expect, it } from 'vitest';
import { captionSpans, captionTexts, readingFrames, scriptLines } from '../captions';
import { textBox } from '../overlays';

describe('captions from a script', () => {
  it('splits the script into lines', () => {
    expect(scriptLines('  Olá\n\n mundo  \r\nfim\n')).toEqual(['Olá', 'mundo', 'fim']);
  });

  it('starts each line at a marker and ends it at the next one', () => {
    const spans = captionSpans(['a', 'b', 'c'], [25, 1, 73, 49, 97], 10, 200);
    expect(spans.map((s) => [s.startFrame, s.endFrame])).toEqual([
      [25, 49],
      [49, 73],
      [73, 97], // ends at the next unused marker
    ]);
  });

  it('lines past the last marker share the remaining time by length', () => {
    const spans = captionSpans(['um', 'x'.repeat(20), 'x'.repeat(40), 'x'.repeat(30)], [1, 41], 1, 101);
    expect(spans[0]).toMatchObject({ startFrame: 1, endFrame: 41 });
    // The 2nd line keeps its marker; 20, 40 and 30 chars split the rest: 41 → 101 over 90 chars
    expect(spans[1].startFrame).toBe(41);
    expect(spans[2].startFrame).toBe(Math.round(41 + (60 * 20) / 90));
    expect(spans[3].startFrame).toBe(Math.round(41 + (60 * 60) / 90));
    expect(spans[3].endFrame).toBe(101);
  });

  it('without markers the whole range is split by length', () => {
    const spans = captionSpans(['a'.repeat(20), 'a'.repeat(60)], [], 1, 81);
    expect(spans.map((s) => [s.startFrame, s.endFrame])).toEqual([
      [1, 21],
      [21, 81],
    ]);
  });

  it('gives a one-word line the same share as a short sentence', () => {
    const [fim, frase] = captionSpans(['Fim', 'x'.repeat(18)], [], 1, 81);
    expect(fim.endFrame - fim.startFrame).toBe(frase.endFrame - frase.startFrame);
  });

  it('never returns empty or backwards spans', () => {
    const spans = captionSpans(['a', 'b', 'c'], [], 1, 3);
    spans.forEach((s) => expect(s.endFrame).toBeGreaterThan(s.startFrame));
    expect(captionSpans([], [1], 1, 10)).toEqual([]);
  });
});

describe('caption texts', () => {
  const style = { width: 1280, height: 720, position: 'bottom' as const, fontSize: 32, idPrefix: 'cap' };

  it('makes one centered, boxed text per span, visible only during it', () => {
    const texts = captionTexts(
      [
        { text: 'a', startFrame: 1, endFrame: 30 },
        { text: 'b', startFrame: 30, endFrame: 50 },
      ],
      style
    );
    expect(texts.map((x) => [x.id, x.startFrame, x.durationFrames])).toEqual([
      ['cap-0', 1, 28], // visible on frames 1..29, the next one takes frame 30
      ['cap-1', 30, 19],
    ]);
    expect(texts[0].align).toBe('center');
    expect(texts[0].bgColor).toBeTruthy();
    expect(texts[0].base.x).toBe(640);
    expect(texts[0].base.y).toBeGreaterThan(600);
  });

  it('places top captions near the top', () => {
    const [t] = captionTexts([{ text: 'a', startFrame: 1, endFrame: 2 }], { ...style, position: 'top' });
    expect(t.base.y).toBeLessThan(150);
  });
});

describe('text box alignment', () => {
  it('centers the box on the anchor when the text is centered', () => {
    const left = textBox({ text: 'hello world', fontSize: 30 });
    const center = textBox({ text: 'hello world', fontSize: 30, align: 'center' });
    expect(left.x).toBe(-8);
    expect(center.x + center.width / 2).toBeCloseTo(0);
  });
});

describe('reading time', () => {
  it('gives short lines a floor and long lines time by length', () => {
    expect(readingFrames(['Fim'], 24)).toBe(Math.ceil(1.2 * 24));
    expect(readingFrames(['x'.repeat(45)], 24)).toBe(72); // 3 s
  });
});
