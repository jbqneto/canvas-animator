/**
 * Captions from a narration script: paste the script (one caption per line), and each line becomes a
 * centered text timed by the timeline markers. Lines past the last marker share the remaining time.
 */
import React, { useMemo, useState } from 'react';
import { Captions, X } from 'lucide-react';
import { CaptionSpan, captionSpans, readingFrames, scriptLines } from '../engine/captions';
import { useI18n } from '../i18n';

export interface CaptionsRequest {
  spans: CaptionSpan[];
  position: 'bottom' | 'top';
  fontSize: number;
}

interface CaptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (request: CaptionsRequest) => void;
  markerFrames: number[];
  /** Captions run from here to the end of the narration... */
  fromFrame: number;
  /** Last frame of the narration audio (0 = none). */
  audioEndFrame: number;
  /** ...or, without narration, to the end of the timeline (extended to a comfortable reading time). */
  timelineEnd: number;
  fps: number;
  defaultFontSize: number;
}

const inputClass =
  'bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:border-sky-500 outline-none';

export const CaptionsDialog: React.FC<CaptionsDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
  markerFrames,
  fromFrame,
  audioEndFrame,
  timelineEnd,
  fps,
  defaultFontSize,
}) => {
  const { t } = useI18n();
  const [script, setScript] = useState('');
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const [fontSize, setFontSize] = useState(defaultFontSize);

  const lines = useMemo(() => scriptLines(script), [script]);
  // `to` is exclusive: the first frame after the captions
  const toFrame =
    audioEndFrame > fromFrame
      ? audioEndFrame + 1
      : Math.max(timelineEnd + 1, fromFrame + readingFrames(lines, fps));
  const spans = useMemo(
    () => captionSpans(lines, markerFrames, fromFrame, toFrame),
    [lines, markerFrames, fromFrame, toFrame]
  );
  const usedMarkers = markerFrames.filter((f) => f >= fromFrame && f < toFrame).length;

  if (!isOpen) return null;

  const seconds = (frame: number) => ((frame - 1) / fps).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="w-[520px] max-h-[90vh] overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-5 space-y-4 text-xs text-neutral-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Captions size={16} className="text-sky-400" /> {t('captions.title')}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">{t('captions.description')}</p>

        <textarea
          id="captions-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={7}
          placeholder={t('captions.placeholder')}
          className={`${inputClass} w-full resize-y font-mono`}
        />

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            {t('captions.position')}
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as 'bottom' | 'top')}
              className={inputClass}
            >
              <option value="bottom">{t('captions.position.bottom')}</option>
              <option value="top">{t('captions.position.top')}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            {t('captions.fontSize')}
            <input
              type="number"
              min={12}
              max={96}
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(12, Math.min(96, Number(e.target.value) || defaultFontSize)))}
              className={`${inputClass} w-16`}
            />
          </label>
        </div>

        <p className="text-[10px] text-neutral-500">
          {t('captions.timing', { from: seconds(fromFrame), to: seconds(toFrame), markers: usedMarkers })}
        </p>

        {spans.length > 0 && (
          <ol id="captions-preview" className="space-y-1 max-h-48 overflow-y-auto border border-neutral-800 rounded p-2">
            {spans.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-sky-400 shrink-0">
                  {seconds(s.startFrame)}–{seconds(s.endFrame)}s
                </span>
                <span className="truncate text-neutral-200">{s.text}</span>
              </li>
            ))}
          </ol>
        )}

        <button
          id="captions-create-btn"
          disabled={spans.length === 0}
          onClick={() => {
            onCreate({ spans, position, fontSize });
            setScript('');
          }}
          className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-neutral-950 font-bold"
        >
          {t('captions.create', { count: spans.length })}
        </button>
      </div>
    </div>
  );
};
