// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAutosave } from '../autosave';
import { useAutosave } from '../useAutosave';

vi.mock('../autosave', () => ({ writeAutosave: vi.fn() }));

let root: Root;
let result: ReturnType<typeof useAutosave>;
const revisionA = {};
const revisionB = {};

function Harness({ enabled = true, revision = revisionA, name = 'A' }) {
  result = useAutosave(enabled, revision, () => ({ name, text: name, savedAt: Date.now() }));
  return null;
}

async function render(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<StrictMode><Harness {...props} /></StrictMode>));
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(writeAutosave).mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('autosave scheduling', () => {
  it('debounces edits and writes the latest revision once, also in StrictMode', async () => {
    await render();
    await advance(1000);
    await render({ revision: revisionB, name: 'B' });
    await advance(1000);
    expect(writeAutosave).not.toHaveBeenCalled();
    await advance(500);
    expect(writeAutosave).toHaveBeenCalledTimes(1);
    expect(writeAutosave).toHaveBeenCalledWith(expect.objectContaining({ name: 'B', text: 'B' }));
    expect(result.status).toBe('saved');
    expect(result.savedAt).toEqual(expect.any(Number));
  });

  it('does not overwrite the recovery slot before recovery is resolved', async () => {
    await render({ enabled: false });
    await advance(2000);
    expect(writeAutosave).not.toHaveBeenCalled();
    expect(result.status).toBe('idle');
    await render({ enabled: true });
    await advance(1500);
    expect(result.status).toBe('saved');
  });

  it('does not mark new edits saved when an older write finishes', async () => {
    let finish: () => void;
    vi.mocked(writeAutosave).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render();
    await advance(1500);
    expect(result.status).toBe('saving');
    await render({ revision: revisionB, name: 'B' });
    await act(async () => finish());
    expect(result.status).toBe('pending');
    expect(result.savedAt).toBeNull();
    await advance(1500);
    expect(result.status).toBe('saved');
  });

  it('shows write errors and allows retry without another edit', async () => {
    vi.mocked(writeAutosave).mockRejectedValueOnce(new Error('Quota'));
    await render();
    await advance(1500);
    expect(result.status).toBe('error');
    expect(result.savedAt).toBeNull();
    await act(async () => result.retry());
    expect(result.status).toBe('saved');
    expect(writeAutosave).toHaveBeenCalledTimes(2);
  });

  it('flushes pending edits when backgrounded and avoids duplicate writes', async () => {
    await render();
    await advance(100);
    await act(async () => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(writeAutosave).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('saved');
    await advance(2000);
    expect(writeAutosave).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
