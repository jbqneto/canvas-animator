import { useEffect, useState } from 'react';
import { KEY_CHANGED_EVENT, readStoredKey } from './aiKey';

/** The user's stored key (or null), kept in sync across dialogs and browser tabs. */
export function useAiKey(): string | null {
  const [key, setKey] = useState(readStoredKey);
  useEffect(() => {
    const sync = () => setKey(readStoredKey());
    window.addEventListener(KEY_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(KEY_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return key;
}
