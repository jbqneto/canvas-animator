/**
 * Crash/refresh protection: the serialized project is kept in IndexedDB (localStorage is too small
 * for embedded images). One slot, overwritten on every change (debounced by the caller).
 */
const DB_NAME = 'flashmotion';
const STORE = 'autosave';
const KEY = 'current';

export interface AutosaveEntry {
  text: string;
  savedAt: number;
  name: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function writeAutosave(entry: AutosaveEntry): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(entry, KEY));
  } catch (err) {
    console.warn('Autosave failed', err);
  }
}

export async function readAutosave(): Promise<AutosaveEntry | null> {
  try {
    return ((await run('readonly', (s) => s.get(KEY))) as AutosaveEntry | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    /* nothing to clear */
  }
}
