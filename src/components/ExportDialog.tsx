import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Layers, Loader2, X } from 'lucide-react';
import type { ExportFormat } from '../utils/exportVideo';
import { MessageKey, useI18n } from '../i18n';

export interface ExportRequest {
  format: ExportFormat;
  startFrame: number;
  endFrame: number;
  includeAudio: boolean;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (request: ExportRequest) => void;
  isExporting: boolean;
  progress: number;
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
  hasBackgroundVideo: boolean;
  /** Number of audio clips that would be mixed (muted ones don't count). */
  audibleClips: number;
}

const FORMATS: { id: ExportFormat; title: MessageKey; description: MessageKey; icon: React.ReactNode }[] = [
  { id: 'mp4', title: 'export.mp4.title', description: 'export.mp4.description', icon: <Film size={16} /> },
  { id: 'webm-alpha', title: 'export.alpha.title', description: 'export.alpha.description', icon: <Layers size={16} /> },
];

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  isExporting,
  progress,
  totalFrames,
  fps,
  width,
  height,
  hasBackgroundVideo,
  audibleClips,
}) => {
  const { t } = useI18n();
  const [format, setFormat] = useState<ExportFormat>('mp4');
  // A transparent layer usually goes over a video that already has the sound, so it starts off there
  const [includeAudio, setIncludeAudio] = useState<Record<ExportFormat, boolean>>({ mp4: true, 'webm-alpha': false });
  const [startFrame, setStartFrame] = useState(1);
  const [endFrame, setEndFrame] = useState(totalFrames);

  // Keep the range valid when the timeline length changes; a range that ended at the end of the
  // timeline keeps doing so (importing a long narration grows the timeline)
  const previousTotal = useRef(totalFrames);
  useEffect(() => {
    const wasAtEnd = endFrame >= previousTotal.current;
    previousTotal.current = totalFrames;
    setEndFrame((e) => (wasAtEnd ? totalFrames : Math.min(Math.max(e, 1), totalFrames) || totalFrames));
    setStartFrame((s) => Math.min(s, totalFrames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalFrames]);

  if (!isOpen) return null;

  const first = Math.max(1, Math.min(startFrame, totalFrames));
  const last = Math.max(first, Math.min(endFrame, totalFrames));
  const seconds = (last - first + 1) / fps;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={() => !isExporting && onClose()}>
      <div
        className="w-[440px] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-5 space-y-4 text-xs"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{t('export.title')}</h3>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              disabled={isExporting}
              className={`w-full text-left p-3 rounded-lg border flex gap-3 transition ${
                format === f.id
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900'
              }`}
            >
              <span className={format === f.id ? 'text-sky-400' : 'text-neutral-500'}>{f.icon}</span>
              <span>
                <span className="block font-semibold text-white">{t(f.title)}</span>
                <span className="block text-[11px] text-neutral-400 mt-0.5">{t(f.description)}</span>
              </span>
            </button>
          ))}
          {format === 'webm-alpha' && hasBackgroundVideo && (
            <p className="text-[11px] text-amber-300">
              {t('export.alpha.noVideo')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 text-neutral-300">
          <span>{t('export.fromFrame')}</span>
          <input
            type="number"
            min={1}
            max={totalFrames}
            value={startFrame}
            disabled={isExporting}
            onChange={(e) => setStartFrame(Number(e.target.value))}
            className="w-16 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 font-mono text-white"
          />
          <span>{t('export.toFrame')}</span>
          <input
            type="number"
            min={1}
            max={totalFrames}
            value={endFrame}
            disabled={isExporting}
            onChange={(e) => setEndFrame(Number(e.target.value))}
            className="w-16 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 font-mono text-white"
          />
          <span className="text-neutral-500 ml-auto">
            {seconds.toFixed(1)}s · {width}×{height} · {fps}fps
          </span>
        </div>

        {audibleClips > 0 && (
          <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
            <input
              id="export-include-audio"
              type="checkbox"
              checked={includeAudio[format]}
              disabled={isExporting}
              onChange={(e) => setIncludeAudio((prev) => ({ ...prev, [format]: e.target.checked }))}
              className="accent-sky-500"
            />
            <span>{t('export.includeAudio', { count: audibleClips })}</span>
          </label>
        )}

        {isExporting ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sky-300">
              <Loader2 size={14} className="animate-spin" /> {t('export.rendering', { progress })}
            </div>
            <div className="h-1.5 rounded bg-neutral-800 overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <button
            onClick={() => onExport({ format, startFrame: first, endFrame: last, includeAudio: audibleClips > 0 && includeAudio[format] })}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold"
          >
            <Download size={15} /> {format === 'mp4' ? t('export.buttonMp4') : t('export.buttonAlpha')}
          </button>
        )}
      </div>
    </div>
  );
};
