/**
 * The user's own Gemini API key ("bring your own key"). Kept only in this browser (localStorage) and
 * sent only to Google, so the installed app works without the FlashMotion server.
 */
const STORAGE_KEY = 'flashmotion.geminiKey';

export function readStoredKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Saves the key (trimmed); an empty key removes it. Returns false when the browser blocks storage. */
export function storeKey(key: string): boolean {
  try {
    const clean = key.trim();
    if (clean) localStorage.setItem(STORAGE_KEY, clean);
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export const KEY_CHANGED_EVENT = 'flashmotion:ai-key-changed';

/** Google AI Studio keys look like "AIza" + 35 characters; used only to warn about typos. */
export const looksLikeGeminiKey = (key: string) => /^AIza[0-9A-Za-z_-]{35}$/.test(key.trim());

/** Shows only the end of the key, e.g. "••••3f9Q". */
export const maskKey = (key: string) => `••••${key.trim().slice(-4)}`;
