import type { ptBR } from './pt-BR';

/** English (US). Typed against the Portuguese dictionary: a missing or extra key is a type error. */
export const enUS: Record<keyof typeof ptBR, string> = {
  // Language switcher
  'lang.label': 'Language',
  'lang.pt-BR': 'Português (BR)',
  'lang.en-US': 'English (US)',

  // Header
  'header.unsaved': 'Unsaved changes',
  'header.allSaved': 'All changes saved',
  'header.open': 'Open project (Ctrl+O)',
  'header.save': 'Save project (Ctrl+S) — Ctrl+Shift+S to save as',
  'header.scenes': 'Scenes:',
  'header.loadExample': 'Load example...',
  'header.example.presenter': '📊 Educational presenter & charts',
  'header.example.walkcycle': '🚶 Stick figure walk cycle',
  'header.example.action': '⚡ Jump & action',
  'header.canvasSize': 'Choose the video resolution and aspect ratio (YouTube, Shorts, etc.)',
  'header.customSize': 'Custom ({width}×{height})',
  'header.undo': 'Undo (Ctrl+Z)',
  'header.redo': 'Redo (Ctrl+Y or Ctrl+Shift+Z)',
  'header.group': 'Group object (Ctrl+G)',
  'header.ungroup': 'Break apart into individual strokes (Ctrl+B)',
  'header.aiImage': 'Create or edit images with AI (Gemini)',
  'header.aiImageButton': 'AI image',
  'header.copilot': 'Open the AI copilot (Gemini)',
  'header.copilotButton': 'AI copilot',
  'header.snapshot': 'Save PNG of the current frame',
  'header.export': 'Render and download the animation video',
  'header.exporting': 'Exporting ({progress}%)',
  'header.exportButton': 'Export video',
  'canvas.preset.youtube-1080p': 'YouTube Full HD (16:9)',
  'canvas.preset.youtube-720p': 'YouTube HD (16:9)',
  'canvas.preset.youtube-shorts': 'YouTube Shorts / TikTok (9:16)',
  'canvas.preset.square': 'Instagram / Feed (1:1)',
  'canvas.preset.portrait': 'Social portrait (4:5)',
  'canvas.preset.ultrawide': 'Cinema ultrawide (21:9)',

  // Canvas presets (custom)
  'canvas.preset.custom': 'Custom',
};
