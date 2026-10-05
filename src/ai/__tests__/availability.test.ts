import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerAiAvailability } from '../useServerAi';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());
describe('server AI availability', () => {
  it('only enables AI when the server explicitly advertises a configured key', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ ai: true })).mockResolvedValueOnce(json({ ai: false })).mockResolvedValueOnce(json({ ai: 'true' }));
    vi.stubGlobal('fetch', fetch);
    expect(await readServerAiAvailability()).toBe(true);
    expect(await readServerAiAvailability()).toBe(false);
    expect(await readServerAiAvailability()).toBe(false);
    expect(fetch).toHaveBeenCalledWith('/api/capabilities', expect.objectContaining({ cache: 'no-store' }));
  });
  it('hides AI on static hosting, offline, malformed responses and API errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('<html>editor</html>', { headers: { 'content-type': 'text/html' } }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('broken', { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 })));
    for (let i = 0; i < 4; i++) expect(await readServerAiAvailability()).toBe(false);
  });
});
