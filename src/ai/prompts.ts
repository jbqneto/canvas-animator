/**
 * What is sent to Gemini and how its answers are read, shared by the server (its own key) and the
 * browser (the user's key). Pure: no SDK, no DOM, no i18n.
 */
import type { ChatRole } from '../types';

export const DEFAULT_CHAT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  role?: ChatRole;
  model?: string;
  locale?: string;
}

export interface ImageRequest {
  prompt: string;
  /** Data URL of the image to edit (edit mode). */
  base64Image?: string;
  aspectRatio?: string;
  model?: string;
}

export function chatSystemInstruction(role: ChatRole | undefined, locale: string | undefined): string {
  let text = `Você é o FlashMotion Copilot, um especialista lendário em animação 2D, animação estilo Adobe Flash, Remotion, motion design educativo e narrativa visual.
Seu objetivo é ajudar o usuário a planejar e criar animações incríveis, incluindo:
1. Roteiros educativos cena a cena com temporização precisa.
2. Coreografia e poses de boneco palito (stick figures) com frames chave (keyframing, antecipação, squash & stretch, follow-through).
3. Ideias de gráficos animados (barras crescendo, roscas de porcentagem, linhas de tendência) e overlays de texto cinético para vídeos.
4. Instruções práticas e amigáveis em português brasileiro (ou no idioma que o usuário preferir).`;

  if (role === 'choreographer') {
    text += `\nFoco atual: COREÓGRAFO DE BONECOS PALITO & ANIMAÇÃO FLASH. Descreva poses chave (Keyframes), articulações (cabeça, braço, antebraço, perna, tronco), timing de passos e curvas de aceleração.`;
  } else if (role === 'educator') {
    text += `\nFoco atual: DIRETOR DE VÍDEO EDUCATIVO & OVERLAYS. Planeje títulos dinâmicos, destaques de dados, gráficos em barras/linhas e chamadas que se sobrepõem ao vídeo.`;
  } else if (role === 'generator') {
    text += `\nFoco atual: GERADOR DE DADOS DE CENA. Quando sugerir uma animação de gráfico ou stick figure, forneça sugestões concretas de valores numéricos, títulos e sequências de frames que o usuário possa aplicar diretamente.`;
  }

  // Reply in the interface language chosen in the app
  text += locale === 'en-US' ? '\nAlways answer in English (US).' : '\nResponda sempre em português do Brasil.';
  return text;
}

/** Conversation in the Gemini format (the assistant is the "model"). */
export const chatContents = (messages: ChatRequest['messages']) =>
  messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

/** Parts of an image request: the picture to edit (if any) followed by the instruction. */
export function imageParts(prompt: string, base64Image?: string) {
  if (base64Image) {
    return [
      { inlineData: { data: base64Image.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' } },
      {
        text: `Edite a imagem com base na seguinte instrução: ${prompt}. Mantenha estilo limpo adequado para ilustração ou backdrop de animação 2D.`,
      },
    ];
  }
  return [
    {
      text: `Crie uma imagem de alta qualidade para uso em animação/vídeo: ${prompt}. Estilo limpo, moderno, ilustração vetorial ou cenário para animação e motion design.`,
    },
  ];
}

interface ImageResponseLike {
  candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; text?: string }[] } }[];
}

/** First generated image as a data URL, plus any text the model sent along. */
export function extractImage(response: ImageResponseLike): { imageUrl: string | null; text: string } {
  let text = '';
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return { imageUrl: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`, text };
    }
    if (part.text) text += part.text;
  }
  return { imageUrl: null, text };
}
