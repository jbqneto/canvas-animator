import { useEffect, useState } from 'react';

/** Server policy controls visibility, even when an old personal key remains in localStorage. */
export async function readServerAiAvailability(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/api/capabilities', { cache: 'no-store', signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    const data = await response.json();
    return data?.ai === true;
  } catch { return false; }
}

export function useServerAi() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let request = 0;
    const refresh = async () => {
      const version = ++request;
      const available = await readServerAiAvailability(controller.signal);
      if (!controller.signal.aborted && version === request) setEnabled(available);
    };
    void refresh();
    window.addEventListener('online', refresh);
    return () => { controller.abort(); window.removeEventListener('online', refresh); };
  }, []);
  return enabled;
}
