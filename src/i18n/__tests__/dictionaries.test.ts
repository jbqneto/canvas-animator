import { describe, expect, it, vi } from 'vitest';
import { ptBR } from '../pt-BR';
import { enUS } from '../en-US';
import { detectInitialLocale, LOCALE_STORAGE_KEY, translate } from '../index';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const keys = Object.keys(ptBR) as (keyof typeof ptBR)[];

  it('keeps every legacy key available in English', () => {
    expect(Object.keys(enUS)).toEqual(expect.arrayContaining([...keys]));
  });

  it.each(keys)('%s has a non-empty text and the same placeholders in both languages', (key) => {
    expect(ptBR[key].trim()).not.toBe('');
    expect(enUS[key].trim()).not.toBe('');
    expect(placeholders(enUS[key])).toEqual(placeholders(ptBR[key]));
  });
});

describe('translate', () => {
  it('interpolates parameters and keeps unknown placeholders', () => {
    expect(translate('en-US', 'lang.label')).toBe('Language');
    expect(translate('pt-BR', 'lang.label')).toBe('Idioma');
  });
});

describe('application locale', () => {
  it('uses English even when a previous Portuguese preference is stored', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === LOCALE_STORAGE_KEY ? 'pt-BR' : null });
    expect(detectInitialLocale()).toBe('en-US');
    vi.unstubAllGlobals();
  });
});
