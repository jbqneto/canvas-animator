import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBDatabase } from 'fake-indexeddb';
import { clearAutosave, readAutosave, writeAutosave } from '../autosave';

const entry = (name = 'Aula') => ({ text: '{"project":{}}', name, savedAt: 123 });

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('autosave storage', () => {
  it('persists an entry and removes it only on explicit discard', async () => {
    expect(await readAutosave()).toBeNull();
    await writeAutosave(entry());
    expect(await readAutosave()).toEqual(entry());
    await clearAutosave();
    expect(await readAutosave()).toBeNull();
  });

  it('rejects when a successful put is rolled back before the transaction commits', async () => {
    await writeAutosave(entry('Previous'));
    const transaction = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
      const tx = transaction.apply(this, args);
      if (args[1] === 'readwrite') {
        const objectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name) => {
          const store = objectStore(name);
          const put = store.put.bind(store);
          store.put = (...putArgs) => {
            const req = put(...putArgs);
            req.addEventListener('success', () => tx.abort());
            return req;
          };
          return store;
        };
      }
      return tx;
    });
    await expect(writeAutosave(entry('Rolled back'))).rejects.toMatchObject({ name: 'AbortError' });
    spy.mockRestore();
    expect(await readAutosave()).toEqual(entry('Previous'));
    // A failed mutation must not poison subsequent writes.
    await writeAutosave(entry('Retry'));
    expect(await readAutosave()).toEqual(entry('Retry'));
  });

  it('keeps writes and discards in invocation order', async () => {
    await Promise.all([writeAutosave(entry('Old')), clearAutosave(), writeAutosave(entry('Latest'))]);
    expect(await readAutosave()).toEqual(entry('Latest'));
  });

  it('surfaces unavailable storage on reads, writes and discards', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('Blocked', 'SecurityError'); } });
    await expect(readAutosave()).rejects.toMatchObject({ name: 'SecurityError' });
    await expect(writeAutosave(entry())).rejects.toMatchObject({ name: 'SecurityError' });
    await expect(clearAutosave()).rejects.toMatchObject({ name: 'SecurityError' });
  });

  it('preserves a malformed recovery entry instead of treating it as an empty slot', async () => {
    await writeAutosave({ ...entry(), savedAt: 'not a timestamp' } as any);
    await expect(readAutosave()).rejects.toMatchObject({ name: 'DataError' });
    await expect(readAutosave()).rejects.toMatchObject({ name: 'DataError' });
  });
});
