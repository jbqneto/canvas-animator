/**
 * Minimal typed i18n: pt-BR (source) and en-US. The chosen language is kept in localStorage; the first
 * visit follows the browser language. `t()` works outside React (errors, history labels) and
 * `useI18n()` re-renders components when the language changes.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ptBR } from './pt-BR';
import { enUS } from './en-US';

export type Locale = 'pt-BR' | 'en-US';
export type MessageKey = keyof typeof ptBR;
export type MessageParams = Record<string, string | number>;

export const LOCALES: Locale[] = ['pt-BR', 'en-US'];
export const LOCALE_STORAGE_KEY = 'flashmotion.locale';

const dictionaries: Record<Locale, Record<MessageKey, string>> = { 'pt-BR': ptBR, 'en-US': enUS };

const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** Saved choice, else the browser language (Portuguese → pt-BR, anything else → en-US). */
export function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // storage blocked (private mode, sandbox): fall back to the browser language
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : 'pt-BR';
  return browser.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}

let currentLocale: Locale = detectInitialLocale();

export function getLocale(): Locale {
  return currentLocale;
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = dictionaries[locale][key] ?? dictionaries['pt-BR'][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Translates with the current language (usable outside React). */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(currentLocale, key, params);
}

/** Short month name in the current language ("Fev" / "Feb"), for sample chart data. */
export function shortMonth(monthIndex: number, locale: Locale = currentLocale): string {
  const name = new Date(2024, monthIndex, 1).toLocaleString(locale, { month: 'short' }).replace('.', '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  const setLocale = useCallback((next: Locale) => {
    currentLocale = next;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // not persisted, but still applied for this session
    }
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
