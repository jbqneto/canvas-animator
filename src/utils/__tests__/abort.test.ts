import { describe, expect, it, vi } from 'vitest';
import { isAbortError, throwIfAborted, withAbort } from '../abort';

describe('abortable browser operations', () => {
  it('cancels a waiting operation without waiting for its result', async () => {
    const controller = new AbortController();
    const pending = withAbort(new Promise(() => {}), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
  });

  it('removes its listener when the underlying operation succeeds or fails', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    expect(await withAbort(Promise.resolve(42), controller.signal)).toBe(42);
    await expect(withAbort(Promise.reject(new Error('Failed')), controller.signal)).rejects.toThrow('Failed');
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('uses the same recognizable error for already canceled operations', async () => {
    const controller = new AbortController(); controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow();
    await expect(withAbort(Promise.resolve(42), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(isAbortError(new DOMException('abort', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('Failed'))).toBe(false);
  });
});
