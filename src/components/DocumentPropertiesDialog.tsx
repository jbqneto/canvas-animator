import React, { useEffect, useRef } from 'react';
import { X, Upload, VideoOff } from 'lucide-react';
import { CanvasDimensions, VideoBackground, CANVAS_PRESETS } from '../types';
import { useI18n } from '../i18n';
interface Props {
  open: boolean; onClose: () => void;
  canvasDimensions: CanvasDimensions; onUpdateCanvasDimensions: (value: CanvasDimensions) => void;
  timelineHeight: number; setTimelineHeight: (value: number) => void;
  videoBg: VideoBackground; setVideoBg: React.Dispatch<React.SetStateAction<VideoBackground>>;
  onUploadVideo: (file: File) => void;
  fps: number; setFps: (value: number) => void;
  totalFrames: number; setTotalFrames: (value: number) => void;
}
export function DocumentPropertiesDialog({ open, onClose, canvasDimensions, onUpdateCanvasDimensions,
  timelineHeight, setTimelineHeight, videoBg, setVideoBg, onUploadVideo, fps, setFps, totalFrames, setTotalFrames }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    aria-labelledby="document-properties-title" className="m-auto overflow-auto w-[520px] max-w-[calc(100vw-32px)] max-h-[85vh] p-0 rounded-xl border border-neutral-700 bg-neutral-950 text-neutral-200 shadow-2xl backdrop:bg-black/70">
    <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
      <h2 id="document-properties-title" className="font-semibold text-sm">{t('workspace.documentProperties')}</h2>
      <button autoFocus onClick={onClose} aria-label={t('workspace.close')} className="p-1 rounded hover:bg-neutral-800"><X size={16} /></button>
    </div>
    <div className="p-5 space-y-5 text-xs">
      {/* Stage Canvas Dimensions & Presets (YouTube, Shorts, etc.) */}
      <div className="space-y-3 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
            {t('inspector.doc.size')}
          </span>
          <span className="text-[9px] font-mono text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/60">
            {canvasDimensions.width} × {canvasDimensions.height} px
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {CANVAS_PRESETS.map(preset => <button key={preset.id} onClick={() => onUpdateCanvasDimensions({width: preset.width, height: preset.height, preset: preset.id})}
            className={`p-2 rounded border text-left ${canvasDimensions.preset === preset.id ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600'}`}>
            <span className="block text-[11px]">{t(`canvas.preset.${preset.id}`)}</span><span className="text-[10px] text-neutral-500 font-mono">{preset.width} × {preset.height}</span>
          </button>)}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label htmlFor="document-width" className="text-[10px] text-neutral-400 block mb-1">{t('inspector.doc.width')}</label>
            <input
              type="number"
              min="320"
              max="3840"
              step="10"
              id="document-width" value={canvasDimensions.width}
              onChange={(e) => {
                const w = Math.max(320, Math.min(3840, Number(e.target.value) || 1280));
                onUpdateCanvasDimensions({
                  ...canvasDimensions,
                  width: w,
                  preset: 'custom',
                });
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="document-height" className="text-[10px] text-neutral-400 block mb-1">{t('inspector.doc.height')}</label>
            <input
              type="number"
              min="240"
              max="2160"
              step="10"
              id="document-height" value={canvasDimensions.height}
              onChange={(e) => {
                const h = Math.max(240, Math.min(2160, Number(e.target.value) || 720));
                onUpdateCanvasDimensions({
                  ...canvasDimensions,
                  height: h,
                  preset: 'custom',
                });
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Timeline Height / Space Controls */}
      <div className="space-y-2 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
            {t('inspector.doc.timelineSize')}
          </span>
          <span className="text-[9px] font-mono text-cyan-400">
            {timelineHeight}px
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => setTimelineHeight(140)}
            className={`py-1 rounded text-center text-xs font-medium border transition ${
              timelineHeight === 140
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
          >
            {t('inspector.doc.timeline.compact')}
          </button>
          <button
            onClick={() => setTimelineHeight(200)}
            className={`py-1 rounded text-center text-xs font-medium border transition ${
              timelineHeight === 200
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
          >
            {t('inspector.doc.timeline.default')}
          </button>
          <button
            onClick={() => setTimelineHeight(320)}
            className={`py-1 rounded text-center text-xs font-medium border transition ${
              timelineHeight === 320
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
          >
            {t('inspector.doc.timeline.wide')}
          </button>
        </div>

        <input
          type="range"
          min="110"
          max="450"
          aria-label={t('inspector.doc.timelineSize')} value={timelineHeight}
          onChange={(e) => setTimelineHeight(Number(e.target.value))}
          className="w-full accent-cyan-500 mt-1"
        />
      </div>

      {/* Stage Background Color */}
      <div className="space-y-2">
        <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
          {t('inspector.doc.bgColor')}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t('inspector.doc.bgColor')} value={videoBg.color || '#09090b'}
            onChange={(e) =>
              setVideoBg((prev) => ({
                ...prev,
                color: e.target.value,
                type: 'color',
              }))
            }
            className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
          />
          <div className="flex gap-1">
            {['#09090b', '#0f172a', '#18181b', '#042f2e', '#1e1b4b'].map((c) => (
              <button
                key={c} aria-label={c}
                onClick={() =>
                  setVideoBg((prev) => ({ ...prev, color: c, type: 'color' }))
                }
                style={{ backgroundColor: c }}
                className="w-6 h-6 rounded border border-neutral-700 hover:scale-110 transition"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Background Video (the footage the overlays enrich) */}
      <div className="space-y-2">
        <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
          {t('inspector.doc.video')}
        </span>
        <label className="flex items-center gap-2 p-2 rounded border border-dashed border-neutral-700 hover:border-purple-500 bg-neutral-900 cursor-pointer transition text-xs text-neutral-300">
          <Upload size={14} className="text-purple-400" />
          <span>
            {videoBg.type === 'upload' ? t('inspector.doc.replaceVideo') : t('inspector.doc.loadVideo')}
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadVideo(file);
              e.target.value = '';
            }}
          />
        </label>
        {videoBg.type !== 'color' && videoBg.url && (
          <>
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>{t('inspector.doc.videoOpacity')}</span>
              <span className="font-mono text-neutral-200">
                {Math.round(videoBg.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={videoBg.opacity}
              onChange={(e) =>
                setVideoBg((prev) => ({ ...prev, opacity: Number(e.target.value) }))
              }
              className="w-full accent-purple-500"
            />
            <button
              onClick={() => setVideoBg((prev) => ({ ...prev, type: 'color', url: '' }))}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white text-xs transition"
            >
              <VideoOff size={13} />
              {t('inspector.doc.removeVideo')}
            </button>
          </>
        )}
      </div>


      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2">{t('workspace.fps')}<input type="number" min="1" max="60" value={fps} onChange={e => setFps(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className="block w-full rounded border border-neutral-700 bg-neutral-900 p-2" /></label>
        <label className="space-y-2">{t('workspace.frames')}<input type="number" min="1" max="36000" value={totalFrames} onChange={e => setTotalFrames(Math.max(1, Math.min(36000, Number(e.target.value) || 1)))} className="block w-full rounded border border-neutral-700 bg-neutral-900 p-2" /></label>
      </div>
    </div>
    <div className="border-t border-neutral-800 p-4 flex justify-end"><button onClick={onClose} className="rounded bg-sky-500 px-5 py-2 text-xs font-semibold text-neutral-950">{t('workspace.done')}</button></div>
  </dialog>;
}
