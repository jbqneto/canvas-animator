import React from 'react';
import { Languages } from 'lucide-react';
import { LOCALES, Locale, useI18n } from '../i18n';

/** Interface language selector (top right). The choice is remembered in localStorage. */
export const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale, t } = useI18n();
  return (
    <label
      title={t('lang.label')}
      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:border-neutral-700"
    >
      <Languages size={14} className="text-sky-400" />
      <select
        aria-label={t('lang.label')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent text-xs font-semibold outline-none cursor-pointer"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-neutral-900 text-white">
            {t(`lang.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
};
