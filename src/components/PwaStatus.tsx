import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Install button (when the browser allows installing) and "new version" banner.
 * Updates are applied only when the user clicks, so an open project is never reloaded by surprise.
 */
export const PwaStatus: React.FC<{ hasUnsavedChanges: boolean }> = ({ hasUnsavedChanges }) => {
  const { t } = useI18n();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own button instead of the mini-infobar
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <>
      {installEvent && (
        <button
          onClick={async () => {
            await installEvent.prompt();
            await installEvent.userChoice;
            setInstallEvent(null);
          }}
          title={t('pwa.installHint')}
          className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-sky-500/50 text-sky-300 text-xs shadow-lg hover:bg-neutral-800"
        >
          <Download size={13} /> {t('pwa.install')}
        </button>
      )}
      {needRefresh && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-lg bg-neutral-900 border border-sky-500/50 text-xs text-neutral-200 shadow-xl">
          <RefreshCw size={13} className="text-sky-400" />
          {t('pwa.newVersion')}
          {hasUnsavedChanges && <span className="text-amber-300">{t('pwa.saveFirst')}</span>}
          <button
            onClick={() => updateServiceWorker(true)}
            className="px-2.5 py-1 rounded bg-sky-500 text-neutral-950 font-semibold hover:bg-sky-400"
          >
            {t('pwa.update')}
          </button>
          <button onClick={() => setNeedRefresh(false)} className="text-neutral-400 hover:text-white">
            {t('pwa.later')}
          </button>
        </div>
      )}
    </>
  );
};
