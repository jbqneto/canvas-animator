import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The SDK is replaced by a fake that records calls and can be told to fail
const google = vi.hoisted(() => ({
  calls: [] as { apiKey: string; method: string; args: any }[],
  fail: null as null | { status?: number; message: string },
  response: {} as any,
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(private opts: { apiKey: string }) {}
    models = {
      generateContent: async (args: any) => {
        google.calls.push({ apiKey: this.opts.apiKey, method: 'generateContent', args });
        if (google.fail) throw Object.assign(new Error(google.fail.message), { status: google.fail.status });
        return google.response;
      },
      list: async (args: any) => {
        google.calls.push({ apiKey: this.opts.apiKey, method: 'list', args });
        if (google.fail) throw Object.assign(new Error(google.fail.message), { status: google.fail.status });
        return [];
      },
    };
  },
}));

import { AiNoImageError, AiSetupError, currentRoute, generateImage, sendChat, testKey } from '../aiClient';
import { looksLikeGeminiKey, maskKey, readStoredKey, storeKey } from '../aiKey';
import { chatContents, chatSystemInstruction, extractImage, imageParts } from '../prompts';

const KEY = 'AIza' + 'x'.repeat(35);

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  google.calls = [];
  google.fail = null;
  google.response = {};
});
afterEach(() => vi.unstubAllGlobals());

describe('prompts shared by server and browser', () => {
  it('builds the system instruction for the role and language', () => {
    expect(chatSystemInstruction('choreographer', 'en-US')).toMatch(/COREÓGRAFO[\s\S]*Always answer in English/);
    expect(chatSystemInstruction(undefined, 'pt-BR')).toMatch(/Responda sempre em português do Brasil\.$/);
  });

  it('maps the conversation and image parts to the Gemini format', () => {
    expect(chatContents([{ role: 'assistant', content: 'oi' }, { role: 'user', content: 'e aí' }])).toEqual([
      { role: 'model', parts: [{ text: 'oi' }] },
      { role: 'user', parts: [{ text: 'e aí' }] },
    ]);
    const parts = imageParts('um céu', 'data:image/png;base64,QUJD');
    expect(parts[0]).toEqual({ inlineData: { data: 'QUJD', mimeType: 'image/png' } });
    expect(imageParts('um céu')).toHaveLength(1);
  });

  it('reads the first image of the answer', () => {
    const parts = [{ text: 'aqui ' }, { inlineData: { data: 'AAA', mimeType: 'image/jpeg' } }];
    expect(extractImage({ candidates: [{ content: { parts } }] })).toEqual({ imageUrl: 'data:image/jpeg;base64,AAA', text: 'aqui ' });
    expect(extractImage({})).toEqual({ imageUrl: null, text: '' });
  });
});

describe('own key storage', () => {
  it('stores, masks and removes the key', () => {
    expect(storeKey(`  ${KEY} `)).toBe(true);
    expect(readStoredKey()).toBe(KEY);
    expect(maskKey(KEY)).toBe('••••xxxx');
    expect(looksLikeGeminiKey(KEY)).toBe(true);
    expect(looksLikeGeminiKey('sk-123')).toBe(false);
    storeKey('');
    expect(readStoredKey()).toBeNull();
  });

  it('survives a browser that blocks storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readStoredKey()).toBeNull();
    expect(storeKey(KEY)).toBe(false);
  });
});

describe('AI client routing', () => {
  it('without a key, uses the server', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { reply: 'olá' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(currentRoute()).toBe('server');
    expect(await sendChat({ messages: [{ role: 'user', content: 'oi' }] })).toBe('olá');
    expect(fetchMock).toHaveBeenCalledWith('/api/gemini/chat', expect.anything());
    expect(google.calls).toEqual([]);
  });

  it('turns a missing server or server key into a setup problem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(sendChat({ messages: [] })).rejects.toMatchObject({ problem: 'offline' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(generateImage({ prompt: 'x' })).rejects.toMatchObject({ problem: 'offline' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { error: 'no key', code: 'no-server-key' })));
    await expect(sendChat({ messages: [] })).rejects.toBeInstanceOf(AiSetupError);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: 'quota' })));
    await expect(sendChat({ messages: [] })).rejects.toThrow('quota');
  });

  it('with a key, talks to Google directly and never to the server', async () => {
    storeKey(KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    google.response = { text: 'resposta' };
    expect(currentRoute()).toBe('own-key');
    expect(await sendChat({ messages: [{ role: 'user', content: 'oi' }], role: 'educator', locale: 'en-US' })).toBe('resposta');
    const call = google.calls[0];
    expect(call.apiKey).toBe(KEY);
    expect(call.args.config.systemInstruction).toMatch(/Always answer in English/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with a key, generates images and reports rejected keys and empty answers', async () => {
    storeKey(KEY);
    google.response = { candidates: [{ content: { parts: [{ inlineData: { data: 'IMG' } }] } }] };
    expect(await generateImage({ prompt: 'sol', aspectRatio: '1:1' })).toBe('data:image/png;base64,IMG');
    expect(google.calls[0].args.config.imageConfig.aspectRatio).toBe('1:1');

    google.response = { candidates: [{ content: { parts: [{ text: 'não posso' }] } }] };
    await expect(generateImage({ prompt: 'sol' })).rejects.toBeInstanceOf(AiNoImageError);

    google.fail = { status: 400, message: 'API key not valid. Please pass a valid API key.' };
    await expect(sendChat({ messages: [] })).rejects.toMatchObject({ problem: 'bad-key' });
    google.fail = { status: 429, message: 'Resource exhausted' };
    await expect(sendChat({ messages: [] })).rejects.not.toBeInstanceOf(AiSetupError);
  });

  it('tests a key with a light request', async () => {
    await testKey(` ${KEY} `);
    expect(google.calls[0]).toMatchObject({ apiKey: KEY, method: 'list' });
    google.fail = { status: 403, message: 'forbidden' };
    await expect(testKey(KEY)).rejects.toMatchObject({ problem: 'bad-key' });
  });
});
