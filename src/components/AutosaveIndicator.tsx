import { useI18n } from '../i18n';
import type { AutosaveStatus } from '../project/useAutosave';

export function AutosaveIndicator({ status, savedAt, onRetry }: {
  status: AutosaveStatus;
  savedAt: number | null;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  if (status === 'idle') return null;
  const title = status === 'saved' && savedAt !== null
    ? t('autosave.savedHint', { time: new Date(savedAt).toLocaleTimeString(locale) })
    : t('autosave.hint');
  return (
    <div className={`text-[9px] leading-tight flex items-center gap-2 ${status === 'error' ? 'text-amber-300' : 'text-neutral-400'}`}>
      <span role="status" aria-live="polite" title={title}>{t(`autosave.${status}`)}</span>
      {status === 'error' && (
        <button type="button" onClick={onRetry} className="underline hover:text-amber-100" title={t('autosave.errorHint')}>
          {t('autosave.retry')}
        </button>
      )}
    </div>
  );
}
