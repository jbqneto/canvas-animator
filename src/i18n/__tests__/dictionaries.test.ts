import { describe, expect, it } from 'vitest';
import { ptBR } from '../pt-BR';
import { enUS } from '../en-US';
import { translate } from '../index';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const keys = Object.keys(ptBR) as (keyof typeof ptBR)[];

  it('have the same keys', () => {
    expect(Object.keys(enUS).sort()).toEqual([...keys].sort());
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
