import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  chatContents,
  chatSystemInstruction,
  ChatRequest,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  extractImage,
  imageParts,
  ImageRequest,
} from './src/ai/prompts';

dotenv.config();

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy GoogleGenAI initialization (server key from .env)
let aiClient: GoogleGenAI | null = null;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

/** Missing server key: the app then suggests using the user's own key (see src/ai/aiClient.ts). */
class NoServerKeyError extends Error {}

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new NoServerKeyError('GEMINI_API_KEY is not configured on the server.');
    aiClient = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  }
  return aiClient;
}

function sendError(res: express.Response, error: any, fallback: string) {
  if (error instanceof NoServerKeyError) {
    return res.status(503).json({ error: error.message, code: 'no-server-key' });
  }
  console.error(fallback, error);
  res.status(500).json({ error: error?.message || fallback });
}

// Chatbot endpoint with multi-turn history & role instruction (prompts shared with the browser)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages, role, model, locale } = req.body as ChatRequest;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }
    const response = await getAIClient().models.generateContent({
      model: model || DEFAULT_CHAT_MODEL,
      contents: chatContents(messages),
      config: { systemInstruction: chatSystemInstruction(role, locale), temperature: 0.7 },
    });
    res.json({ reply: response.text || '' });
  } catch (error: any) {
    sendError(res, error, 'Erro ao processar mensagem com Gemini.');
  }
});

// Image generation & editing endpoint
app.post('/api/gemini/image', async (req, res) => {
  try {
    const { prompt, base64Image, aspectRatio = '16:9', model } = req.body as ImageRequest;
    if (!prompt) return res.status(400).json({ error: 'Prompt é obrigatório.' });
    const response = await getAIClient().models.generateContent({
      model: model || DEFAULT_IMAGE_MODEL,
      contents: { parts: imageParts(prompt, base64Image) },
      config: { imageConfig: { aspectRatio: aspectRatio as any } },
    });
    const { imageUrl, text } = extractImage(response);
    if (!imageUrl) {
      return res.status(422).json({ error: 'Não foi possível extrair a imagem gerada da resposta do modelo.', details: text, code: 'no-image' });
    }
    res.json({ imageUrl, text });
  } catch (error: any) {
    sendError(res, error, 'Erro ao gerar imagem com Gemini.');
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    // Dev only: the production bundle is CommonJS and must not load Vite at all
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FlashMotion Studio running on http://0.0.0.0:${PORT}`);
  });
}

start();
