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
    req.onblocked = () => {
      reject(new DOMException(DB_NAME, 'InvalidStateError'));
      // The request may still succeed after the blocking connection closes.
      req.onsuccess = () => req.result.close();
    };
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      // A successful request can still be rolled back (e.g. storage quota).
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error ?? new DOMException(STORE, 'AbortError'));
      tx.onerror = () => reject(tx.error ?? req.error);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

// Opening separate connections can finish out of order. Keep mutations in invocation order,
// including discards, and allow the queue to continue after a failed transaction.
let mutations: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutations.then(operation);
  mutations = next.catch(() => undefined);
  return next;
}

export function writeAutosave(entry: AutosaveEntry): Promise<void> {
  return enqueue(async () => { await run('readwrite', (s) => s.put(entry, KEY)); });
}

export async function readAutosave(): Promise<AutosaveEntry | null> {
  await mutations;
  const entry: unknown = await run('readonly', (s) => s.get(KEY));
  if (entry === undefined) return null;
  if (!entry || typeof entry !== 'object' ||
      typeof (entry as AutosaveEntry).text !== 'string' ||
      typeof (entry as AutosaveEntry).name !== 'string' ||
      !Number.isFinite((entry as AutosaveEntry).savedAt)) {
    throw new DOMException(STORE, 'DataError');
  }
  return entry as AutosaveEntry;
}

export function clearAutosave(): Promise<void> {
  return enqueue(async () => { await run('readwrite', (s) => s.delete(KEY)); });
}
