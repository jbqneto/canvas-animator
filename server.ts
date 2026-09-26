import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy GoogleGenAI initialization
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in the environment.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Chatbot endpoint with multi-turn history & role instruction
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages, role, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const ai = getAIClient();

    // Default system instructions based on role
    let systemInstruction = `Você é o FlashMotion Copilot, um especialista lendário em animação 2D, animação estilo Adobe Flash, Remotion, motion design educativo e narrativa visual.
Seu objetivo é ajudar o usuário a planejar e criar animações incríveis, incluindo:
1. Roteiros educativos cena a cena com temporização precisa.
2. Coreografia e poses de boneco palito (stick figures) com frames chave (keyframing, antecipação, squash & stretch, follow-through).
3. Ideias de gráficos animados (barras crescendo, roscas de porcentagem, linhas de tendência) e overlays de texto cinético para vídeos.
4. Instruções práticas e amigáveis em português brasileiro (ou no idioma que o usuário preferir).`;

    if (role === 'choreographer') {
      systemInstruction += `\nFoco atual: COREÓGRAFO DE BONECOS PALITO & ANIMAÇÃO FLASH. Descreva poses chave (Keyframes), articulações (cabeça, braço, antebraço, perna, tronco), timing de passos e curvas de aceleração.`;
    } else if (role === 'educator') {
      systemInstruction += `\nFoco atual: DIRETOR DE VÍDEO EDUCATIVO & OVERLAYS. Planeje títulos dinâmicos, destaques de dados, gráficos em barras/linhas e chamadas que se sobrepõem ao vídeo.`;
    } else if (role === 'generator') {
      systemInstruction += `\nFoco atual: GERADOR DE DADOS DE CENA. Quando sugerir uma animação de gráfico ou stick figure, forneça sugestões concretas de valores numéricos, títulos e sequências de frames que o usuário possa aplicar diretamente.`;
    }

    // Format conversation history for Gemini API
    const formattedContents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Choose model safely: support requested models with safe fallback
    const targetModel = model || 'gemini-3.8-flash';

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const replyText = response.text || 'Sem resposta do modelo.';
    res.json({ reply: replyText });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar mensagem com Gemini.' });
  }
});

// Image Generation & Editing endpoint
app.post('/api/gemini/image', async (req, res) => {
  try {
    const { prompt, base64Image, aspectRatio = '16:9', model } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt é obrigatório.' });
    }

    const ai = getAIClient();
    const imageModel = model || 'gemini-3.1-flash-lite-image';

    let parts: any[] = [];

    if (base64Image) {
      // Clean base64 header if present
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: 'image/png',
        },
      });
      parts.push({
        text: `Edite a imagem com base na seguinte instrução: ${prompt}. Mantenha estilo limpo adequado para ilustração ou backdrop de animação 2D.`,
      });
    } else {
      parts.push({
        text: `Crie uma imagem de alta qualidade para uso em animação/vídeo: ${prompt}. Estilo limpo, moderno, ilustração vetorial ou cenário para animação e motion design.`,
      });
    }

    const response = await ai.models.generateContent({
      model: imageModel,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
        },
      },
    });

    let imageUrl: string | null = null;
    let textFeedback = '';

    const candidates = response.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        } else if (part.text) {
          textFeedback += part.text;
        }
      }
    }

    if (!imageUrl) {
      return res.status(422).json({
        error: 'Não foi possível extrair a imagem gerada da resposta do modelo.',
        details: textFeedback,
      });
    }

    res.json({ imageUrl, text: textFeedback });
  } catch (error: any) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: error.message || 'Erro ao gerar imagem com Gemini.' });
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
