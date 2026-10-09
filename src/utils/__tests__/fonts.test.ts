import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { charWidthEm, DEFAULT_FONT_FAMILY, FONT_FAMILIES, fontCss, loadSceneFonts } from '../fonts';

describe('fontCss', () => {
  it('keeps the historical look by default', () => {
    expect(fontCss({}, 40)).toBe('800 40px "Plus Jakarta Sans", sans-serif');
  });
  it('builds an italic serif quote font', () => {
    expect(fontCss({ fontFamily: 'Cormorant Garamond', fontWeight: 500, italic: true }, 84)).toBe(
      'italic 500 84px "Cormorant Garamond", serif'
    );
  });
  it('uses a monospace fallback for mono families', () => {
    expect(fontCss({ fontFamily: 'IBM Plex Mono', fontWeight: 400 }, 170)).toBe('400 170px "IBM Plex Mono", monospace');
  });
  it('rounds the weight to hundreds and clamps it to 100..900', () => {
    expect(fontCss({ fontWeight: 520 }, 10)).toContain('500 10px');
    expect(fontCss({ fontWeight: 5000 }, 10)).toContain('900 10px');
    expect(fontCss({ fontWeight: -3 }, 10)).toContain('100 10px');
    expect(fontCss({ fontWeight: Number.NaN }, 10)).toContain('800 10px');
  });
  it('falls back to the default family for unknown or hostile names', () => {
    for (const bad of ['Comic Sans', 'x"; background:url(http://evil)', '', 'inherit']) {
      expect(fontCss({ fontFamily: bad }, 20)).toBe(`800 20px "${DEFAULT_FONT_FAMILY}", sans-serif`);
    }
  });
});

describe('loadSceneFonts', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('asks the browser to load each distinct font once', async () => {
    const load = vi.fn(async () => []);
    vi.stubGlobal('document', { fonts: { load } });
    await loadSceneFonts([
      { fontSize: 84, fontFamily: 'Cormorant Garamond', fontWeight: 500, italic: true },
      { fontSize: 84, fontFamily: 'Cormorant Garamond', fontWeight: 500, italic: true },
      { fontSize: 22 },
    ]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledWith('italic 500 84px "Cormorant Garamond", serif');
  });
  it('does nothing without document.fonts', async () => {
    vi.stubGlobal('document', {});
    await expect(loadSceneFonts([{ fontSize: 10 }])).resolves.toBeUndefined();
  });
});

describe('index.html', () => {
  it('requests every allowed family from Google Fonts', () => {
    const html = readFileSync('index.html', 'utf8');
    for (const family of FONT_FAMILIES) expect(html).toContain(family.replace(/ /g, '+'));
  });

describe('charWidthEm', () => {
  it('estimates glyph width per family', () => {
    expect(charWidthEm('IBM Plex Mono')).toBe(0.6);
    expect(charWidthEm('JetBrains Mono')).toBe(0.6);
    expect(charWidthEm('Cormorant Garamond')).toBe(0.45);
    expect(charWidthEm('Inter')).toBe(0.55);
    expect(charWidthEm(undefined)).toBe(0.55);
    expect(charWidthEm('anything else')).toBe(0.55);
  });
});
});
