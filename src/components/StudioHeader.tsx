import React from 'react';
import {
  Film,
  Download,
  Camera,
  Sparkles,
  Bot,
  RotateCcw,
  Loader2,
  Group,
  Ungroup,
  Monitor,
} from 'lucide-react';
import { CanvasDimensions, CANVAS_PRESETS } from '../types';

interface StudioHeaderProps {
  onExportVideo: () => void;
  isExporting: boolean;
  exportProgress: number;
  onSnapshot: () => void;
  onOpenAiImage: () => void;
  onToggleChatbot: () => void;
  chatbotOpen: boolean;
  onLoadPreset: (presetName: string) => void;
  onResetProject: () => void;
  // History & Grouping
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  hasSelection: boolean;
  // Canvas Dimensions
  canvasDimensions: CanvasDimensions;
  onUpdateCanvasDimensions: (dim: CanvasDimensions) => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  onExportVideo,
  isExporting,
  exportProgress,
  onSnapshot,
  onOpenAiImage,
  onToggleChatbot,
  chatbotOpen,
  onLoadPreset,
  onResetProject,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGroupSelected,
  onUngroupSelected,
  hasSelection,
  canvasDimensions,
  onUpdateCanvasDimensions,
}) => {
  return (
    <header className="h-14 px-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between shrink-0 select-none z-20">
      {/* Brand & Tagline */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center text-neutral-950 shadow-md shadow-sky-500/20">
            <Film size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white font-sans">
                FlashMotion <span className="text-sky-400">Studio</span>
              </span>
              <span className="text-[9px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60">
                Flash + Remotion
              </span>
            </div>
            <p className="text-[10px] text-neutral-400 leading-tight">
              Animação 2D, Camadas, Gráficos & Stick Figures
            </p>
          </div>
        </div>

        {/* Presets dropdown */}
        <div className="hidden lg:flex items-center gap-2 ml-3 pl-3 border-l border-neutral-800">
          <span className="text-[11px] text-neutral-400 font-medium">Cenas:</span>
          <select
            onChange={(e) => {
              if (e.target.value) onLoadPreset(e.target.value);
            }}
            defaultValue=""
            className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 outline-none transition cursor-pointer"
          >
            <option value="" disabled>
              Carregar Exemplo...
            </option>
            <option value="presenter">📊 Apresentador Educativo & Gráficos</option>
            <option value="walkcycle">🚶 Caminhada Stick Figure no Vídeo</option>
            <option value="action">⚡ Salto e Ação Flash</option>
          </select>
        </div>

        {/* Canvas Dimension Presets (YouTube, Shorts, Instagram, Custom) */}
        <div className="hidden md:flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-800 rounded px-2.5 py-1">
          <Monitor size={13} className="text-sky-400 shrink-0" />
          <select
            value={canvasDimensions.preset}
            onChange={(e) => {
              const p = e.target.value as CanvasDimensions['preset'];
              const found = CANVAS_PRESETS.find((pr) => pr.id === p);
              if (found) {
                onUpdateCanvasDimensions({
                  width: found.width,
                  height: found.height,
                  preset: found.id,
                });
              }
            }}
            className="bg-transparent text-neutral-200 text-xs font-semibold outline-none cursor-pointer"
            title="Selecione a resolução e proporção do canvas (YouTube, Shorts, etc.)"
          >
            {CANVAS_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-neutral-900 text-white">
                {p.name} ({p.width}×{p.height})
              </option>
            ))}
            <option value="custom" className="bg-neutral-900 text-white">
              Personalizado ({canvasDimensions.width}×{canvasDimensions.height})
            </option>
          </select>
        </div>
      </div>

      {/* Middle: Flash Quick Actions (Undo / Redo / Group / Ungroup) */}
      <div className="flex items-center gap-1 bg-neutral-900/80 px-2 py-1 rounded-lg border border-neutral-800">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-white transition flex items-center gap-1"
        >
          <RotateCcw size={14} />
          <span className="text-[10px] font-mono hidden sm:inline">Ctrl+Z</span>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)"
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-white transition flex items-center gap-1"
        >
          <RotateCcw size={14} className="scale-x-[-1]" />
          <span className="text-[10px] font-mono hidden sm:inline">Ctrl+Y</span>
        </button>

        <div className="w-[1px] h-4 bg-neutral-800 mx-1" />

        <button
          onClick={onGroupSelected}
          disabled={!hasSelection}
          title="Agrupar objeto (Ctrl+G)"
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-sky-300 transition flex items-center gap-1"
        >
          <Group size={14} />
          <span className="text-[10px] font-mono hidden md:inline">Ctrl+G</span>
        </button>

        <button
          onClick={onUngroupSelected}
          disabled={!hasSelection}
          title="Desagrupar em traços individuais (Ctrl+B)"
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-amber-300 transition flex items-center gap-1"
        >
          <Ungroup size={14} />
          <span className="text-[10px] font-mono hidden md:inline">Ctrl+B</span>
        </button>
      </div>

      {/* Right Action Buttons */}
      <div className="flex items-center gap-2">
        {/* AI Image Generation Trigger */}
        <button
          onClick={onOpenAiImage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-300 border border-fuchsia-500/30 text-xs font-semibold transition"
          title="Criar ou editar imagens com Gemini Flash Image"
        >
          <Sparkles size={14} />
          <span className="hidden sm:inline">Gerar Imagem IA</span>
        </button>

        {/* Gemini Chatbot Trigger */}
        <button
          onClick={onToggleChatbot}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            chatbotOpen
              ? 'bg-sky-500 text-neutral-950 border-sky-400 font-bold shadow-md shadow-sky-500/20'
              : 'bg-neutral-900 hover:bg-neutral-800 text-sky-400 border-neutral-800'
          }`}
          title="Abrir Copiloto Gemini"
        >
          <Bot size={14} />
          <span className="hidden sm:inline">Copiloto IA</span>
        </button>

        {/* Snapshot PNG */}
        <button
          onClick={onSnapshot}
          className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition"
          title="Salvar Foto PNG do Frame Atual"
        >
          <Camera size={15} />
        </button>

        {/* Export WebM Video Button */}
        <button
          onClick={onExportVideo}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-neutral-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition active:scale-95"
          title="Renderizar e baixar vídeo WebM da animação"
        >
          {isExporting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Exportando ({exportProgress}%)</span>
            </>
          ) : (
            <>
              <Download size={15} />
              <span>Exportar Vídeo</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
