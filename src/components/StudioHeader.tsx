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
  FolderOpen,
  Save,
} from 'lucide-react';
import { CanvasDimensions, CANVAS_PRESETS } from '../types';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

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
  projectName: string;
  isDirty: boolean;
  onOpenProject: () => void;
  onSaveProject: () => void;
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
  projectName,
  isDirty,
  onOpenProject,
  onSaveProject,
}) => {
  const { t } = useI18n();
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
              <span className="hidden 2xl:inline text-[9px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60">
                Flash + Remotion
              </span>
            </div>
            <p
              className="text-[10px] text-neutral-400 leading-tight flex items-center gap-1 max-w-56"
              title={isDirty ? t('header.unsaved') : t('header.allSaved')}
            >
              <span className="truncate">{projectName}</span>
              {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
            </p>
          </div>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={onOpenProject}
              title={t('header.open')}
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            >
              <FolderOpen size={15} />
            </button>
            <button
              onClick={onSaveProject}
              title={t('header.save')}
              className={`p-1.5 rounded hover:bg-neutral-800 transition ${
                isDirty ? 'text-amber-300 hover:text-amber-200' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Save size={15} />
            </button>
          </div>
        </div>

        {/* Presets dropdown */}
        <div className="hidden lg:flex items-center gap-2 ml-2 pl-2 border-l border-neutral-800">
          <span className="hidden 2xl:inline text-[11px] text-neutral-400 font-medium">{t('header.scenes')}</span>
          <select
            onChange={(e) => {
              if (e.target.value) onLoadPreset(e.target.value);
            }}
            defaultValue=""
            className="max-w-36 2xl:max-w-none bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 outline-none transition cursor-pointer"
          >
            <option value="" disabled>
              {t('header.loadExample')}
            </option>
            <option value="presenter">{t('header.example.presenter')}</option>
            <option value="walkcycle">{t('header.example.walkcycle')}</option>
            <option value="action">{t('header.example.action')}</option>
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
            className="max-w-40 2xl:max-w-none bg-transparent text-neutral-200 text-xs font-semibold outline-none cursor-pointer"
            title={t('header.canvasSize')}
          >
            {CANVAS_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-neutral-900 text-white">
                {t(`canvas.preset.${p.id}` as const)} ({p.width}×{p.height})
              </option>
            ))}
            <option value="custom" className="bg-neutral-900 text-white">
              {t('header.customSize', { width: canvasDimensions.width, height: canvasDimensions.height })}
            </option>
          </select>
        </div>
      </div>

      {/* Middle: Flash Quick Actions (Undo / Redo / Group / Ungroup) */}
      <div className="flex items-center gap-1 bg-neutral-900/80 px-2 py-1 rounded-lg border border-neutral-800">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={t('header.undo')}
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-white transition flex items-center gap-1"
        >
          <RotateCcw size={14} />
          <span className="text-[10px] font-mono hidden 2xl:inline">Ctrl+Z</span>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={t('header.redo')}
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-white transition flex items-center gap-1"
        >
          <RotateCcw size={14} className="scale-x-[-1]" />
          <span className="text-[10px] font-mono hidden 2xl:inline">Ctrl+Y</span>
        </button>

        <div className="w-[1px] h-4 bg-neutral-800 mx-1" />

        <button
          onClick={onGroupSelected}
          disabled={!hasSelection}
          title={t('header.group')}
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-sky-300 transition flex items-center gap-1"
        >
          <Group size={14} />
          <span className="text-[10px] font-mono hidden 2xl:inline">Ctrl+G</span>
        </button>

        <button
          onClick={onUngroupSelected}
          disabled={!hasSelection}
          title={t('header.ungroup')}
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 hover:text-amber-300 transition flex items-center gap-1"
        >
          <Ungroup size={14} />
          <span className="text-[10px] font-mono hidden 2xl:inline">Ctrl+B</span>
        </button>
      </div>

      {/* Right Action Buttons */}
      <div className="flex items-center gap-2">
        {/* AI Image Generation Trigger */}
        <button
          onClick={onOpenAiImage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-300 border border-fuchsia-500/30 text-xs font-semibold transition"
          title={t('header.aiImage')}
        >
          <Sparkles size={14} />
          <span className="hidden 2xl:inline">{t('header.aiImageButton')}</span>
        </button>

        {/* Gemini Chatbot Trigger */}
        <button
          onClick={onToggleChatbot}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            chatbotOpen
              ? 'bg-sky-500 text-neutral-950 border-sky-400 font-bold shadow-md shadow-sky-500/20'
              : 'bg-neutral-900 hover:bg-neutral-800 text-sky-400 border-neutral-800'
          }`}
          title={t('header.copilot')}
        >
          <Bot size={14} />
          <span className="hidden 2xl:inline">{t('header.copilotButton')}</span>
        </button>

        {/* Snapshot PNG */}
        <button
          onClick={onSnapshot}
          className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition"
          title={t('header.snapshot')}
        >
          <Camera size={15} />
        </button>

        {/* Export WebM Video Button */}
        <button
          onClick={onExportVideo}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-neutral-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition active:scale-95"
          title={t('header.export')}
        >
          {isExporting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>{t('header.exporting', { progress: exportProgress })}</span>
            </>
          ) : (
            <>
              <Download size={15} />
              <span>{t('header.exportButton')}</span>
            </>
          )}
        </button>

        <LanguageSwitcher />
      </div>
    </header>
  );
};
