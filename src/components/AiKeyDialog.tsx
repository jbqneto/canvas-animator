/**
 * "Bring your own key": the user pastes a Google AI Studio (Gemini) key, it is checked with a light
 * request and kept only in this browser. With a key, the AI features work without the FlashMotion
 * server (installed app); without one, they use the server's key when there is a server.
 */
import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Loader2, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { looksLikeGeminiKey, maskKey, storeKey } from '../ai/aiKey';
import { AiSetupError, testKey } from '../ai/aiClient';
import { useAiKey } from '../ai/useAiKey';

interface AiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEY_PAGE = 'https://aistudio.google.com/apikey';

export const AiKeyDialog: React.FC<AiKeyDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const savedKey = useAiKey();
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<{ kind: 'testing' | 'ok' | 'error'; text?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft('');
    setVisible(false);
    setStatus(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const save = async () => {
    const key = draft.trim();
    if (!key) return;
    setStatus({ kind: 'testing' });
    try {
      await testKey(key);
    } catch (err) {
      const text =
        err instanceof AiSetupError ? t('aiKey.rejected') : t('aiKey.testFailed', { error: err instanceof Error ? err.message : String(err) });
      setStatus({ kind: 'error', text });
      return;
    }
    if (!storeKey(key)) {
      setStatus({ kind: 'error', text: t('aiKey.storageBlocked') });
      return;
    }
    setDraft('');
    setStatus({ kind: 'ok', text: t('aiKey.saved') });
  };

  const remove = () => {
    storeKey('');
    setStatus(null);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" data-ai-key-dialog>
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-neutral-100">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <KeyRound size={17} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{t('aiKey.title')}</h3>
              <p className="text-[11px] text-neutral-400">{t('aiKey.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} title={t('aiKey.close')} className="p-1 rounded text-neutral-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Which route the AI features take right now */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 flex items-center justify-between gap-2">
            <span className="text-neutral-300" data-ai-route>
              {savedKey ? t('aiKey.usingOwn', { key: maskKey(savedKey) }) : t('aiKey.usingServer')}
            </span>
            {savedKey && (
              <button
                onClick={remove}
                className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] shrink-0"
              >
                <Trash2 size={12} />
                {t('aiKey.remove')}
              </button>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-neutral-300 font-medium">{savedKey ? t('aiKey.replaceLabel') : t('aiKey.label')}</span>
            <div className="flex gap-1.5">
              <input
                type={visible ? 'text' : 'password'}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setStatus(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="AIza…"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 font-mono text-white focus:border-amber-500 outline-none"
              />
              <button
                onClick={() => setVisible((v) => !v)}
                title={visible ? t('aiKey.hide') : t('aiKey.show')}
                className="px-2 rounded border border-neutral-700 text-neutral-400 hover:text-white"
              >
                {visible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {draft.trim() && !looksLikeGeminiKey(draft) && (
              <span className="block text-amber-400/90 text-[11px]">{t('aiKey.formatWarning')}</span>
            )}
          </label>

          {status && (
            <p
              className={`flex items-center gap-1.5 ${
                status.kind === 'error' ? 'text-rose-300' : status.kind === 'ok' ? 'text-emerald-300' : 'text-neutral-400'
              }`}
              data-ai-key-status={status.kind}
            >
              {status.kind === 'testing' ? <Loader2 size={13} className="animate-spin" /> : status.kind === 'ok' ? <Check size={13} /> : null}
              {status.kind === 'testing' ? t('aiKey.testing') : status.text}
            </p>
          )}

          <button
            onClick={save}
            disabled={!draft.trim() || status?.kind === 'testing'}
            className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold disabled:opacity-40"
          >
            {t('aiKey.testAndSave')}
          </button>

          <div className="space-y-1.5 text-[11px] text-neutral-400 leading-snug border-t border-neutral-800 pt-3">
            <p>
              {t('aiKey.howTo')}{' '}
              <a href={KEY_PAGE} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                aistudio.google.com/apikey
              </a>
            </p>
            <p>{t('aiKey.privacy')}</p>
            <p>{t('aiKey.costs')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
