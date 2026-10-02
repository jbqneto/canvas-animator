import { useCallback, useEffect, useRef, useState } from 'react';
import { AutosaveEntry, writeAutosave } from './autosave';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Debounces edits, flushes on backgrounding, and never labels an older revision as saved. */
export function useAutosave(enabled: boolean, revision: object, createEntry: () => AutosaveEntry) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const createEntryRef = useRef(createEntry);
  createEntryRef.current = createEntry;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const dirty = useRef(false);
  const inFlight = useRef<number | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const flush = useCallback(async () => {
    if (!enabled || !dirty.current || inFlight.current === generation.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const current = generation.current;
    inFlight.current = current;
    setStatus('saving');
    try {
      const entry = createEntryRef.current();
      await writeAutosave(entry);
      if (mounted.current && current === generation.current) {
        dirty.current = false;
        setSavedAt(entry.savedAt);
        setStatus('saved');
      }
    } catch {
      if (mounted.current && current === generation.current) setStatus('error');
    } finally {
      if (inFlight.current === current) inFlight.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    generation.current++;
    dirty.current = enabled;
    setStatus(enabled ? 'pending' : 'idle');
    setSavedAt(null);
    if (enabled) timer.current = setTimeout(() => { void flush(); }, 1500);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      // Invalidate writes from an earlier revision or an unmounted editor.
      generation.current++;
    };
  }, [enabled, revision, flush]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => { void flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flush]);

  return { status, savedAt, retry: flush };
}
