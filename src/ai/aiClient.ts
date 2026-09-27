/**
 * Gemini calls from the app. With the user's own key (see `aiKey.ts`) the browser talks to Google
 * directly and the FlashMotion server is not needed (installed app, static hosting). Without it,
 * requests go to the server, which uses its own key.
 */
import { readStoredKey } from './aiKey';
import {
  chatContents,
  chatSystemInstruction,
  ChatRequest,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  extractImage,
  imageParts,
  ImageRequest,
} from './prompts';

/**
 * Why the AI can't answer and the user can fix it by setting a key:
 * - 'no-key': no key of their own and the server has none either;
 * - 'offline': no key of their own and no server reachable (installed app, static hosting);
 * - 'bad-key': Google rejected the user's key.
 */
export type AiSetupProblem = 'no-key' | 'offline' | 'bad-key';

export class AiSetupError extends Error {
  constructor(public readonly problem: AiSetupProblem, message: string = problem) {
    super(message);
    this.name = 'AiSetupError';
  }
}

export class AiNoImageError extends Error {
  constructor(public readonly details: string) {
    super('no-image');
    this.name = 'AiNoImageError';
  }
}

export type AiRoute = 'own-key' | 'server';
export const currentRoute = (): AiRoute => (readStoredKey() ? 'own-key' : 'server');

// The SDK is only needed with the user's key: loaded on demand to keep the editor bundle small
async function googleClient(apiKey: string) {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
}

/** Rejected keys become a setup problem; anything else (quota, model, network) is passed on. */
function fromGoogleError(err: unknown): Error {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403 || /API[_ ]key/i.test(message)) return new AiSetupError('bad-key', message);
  return err instanceof Error ? err : new Error(message);
}

async function postToServer<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new AiSetupError('offline');
  }
  // Static hosting (or the installed app's cache) answers with the page itself, not the API
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  if (res.status === 404 || !isJson) throw new AiSetupError('offline');
  const data = await res.json();
  if (!res.ok) {
    if (data?.code === 'no-server-key') throw new AiSetupError('no-key', data.error);
    if (data?.code === 'no-image') throw new AiNoImageError(data.details ?? '');
    throw new Error(data?.error || `${res.status} ${res.statusText}`);
  }
  return data as T;
}

export async function sendChat(req: ChatRequest): Promise<string> {
  const key = readStoredKey();
  if (!key) return (await postToServer<{ reply: string }>('/api/gemini/chat', req)).reply;
  const ai = await googleClient(key);
  try {
    const response = await ai.models.generateContent({
      model: req.model || DEFAULT_CHAT_MODEL,
      contents: chatContents(req.messages),
      config: { systemInstruction: chatSystemInstruction(req.role, req.locale), temperature: 0.7 },
    });
    return response.text ?? '';
  } catch (err) {
    throw fromGoogleError(err);
  }
}

/** Generated (or edited) image as a data URL. */
export async function generateImage(req: ImageRequest): Promise<string> {
  const key = readStoredKey();
  if (!key) return (await postToServer<{ imageUrl: string }>('/api/gemini/image', req)).imageUrl;
  const ai = await googleClient(key);
  let result: ReturnType<typeof extractImage>;
  try {
    const response = await ai.models.generateContent({
      model: req.model || DEFAULT_IMAGE_MODEL,
      contents: { parts: imageParts(req.prompt, req.base64Image) },
      config: { imageConfig: { aspectRatio: req.aspectRatio ?? '16:9' } },
    });
    result = extractImage(response);
  } catch (err) {
    throw fromGoogleError(err);
  }
  if (!result.imageUrl) throw new AiNoImageError(result.text);
  return result.imageUrl;
}

/** Checks a key with a light request (lists one model) before saving it. */
export async function testKey(apiKey: string): Promise<void> {
  const ai = await googleClient(apiKey.trim());
  try {
    await ai.models.list({ config: { pageSize: 1 } });
  } catch (err) {
    throw fromGoogleError(err);
  }
}
