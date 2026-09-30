/**
 * Captions from a narration script: paste the script (one caption per line), and each line becomes a
 * centered text timed by the timeline markers. Lines past the last marker share the remaining time.
 * A subtitle file (.srt/.vtt) brings its own timing instead; the project's captions download as .srt.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Captions, Download, FileText, X } from 'lucide-react';
import { CaptionSpan, captionSpans, parseSubtitles, readingFrames, scriptLines, toSrt } from '../engine/captions';
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
  /** Captions already in the project, for the .srt download. */
  projectCaptions: CaptionSpan[];
  /** Name for the downloaded file (without extension). */
  fileName: string;
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
  projectCaptions,
  fileName,
}) => {
  const { t } = useI18n();
  const [script, setScript] = useState('');
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const [fontSize, setFontSize] = useState(defaultFontSize);
  // A loaded subtitle file replaces the script while it is set
  const [imported, setImported] = useState<{ name: string; spans: CaptionSpan[] } | null>(null);
  const [importError, setImportError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => scriptLines(script), [script]);
  // `to` is exclusive: the first frame after the captions
  const toFrame =
    audioEndFrame > fromFrame
      ? audioEndFrame + 1
      : Math.max(timelineEnd + 1, fromFrame + readingFrames(lines, fps));
  const scriptSpans = useMemo(
    () => captionSpans(lines, markerFrames, fromFrame, toFrame),
    [lines, markerFrames, fromFrame, toFrame]
  );
  const spans = imported?.spans ?? scriptSpans;
  const usedMarkers = markerFrames.filter((f) => f >= fromFrame && f < toFrame).length;

  if (!isOpen) return null;

  const seconds = (frame: number) => ((frame - 1) / fps).toFixed(1);

  const importFile = async (file: File) => {
    const parsed = parseSubtitles(await file.text(), fps);
    setImportError(parsed.length === 0);
    setImported(parsed.length ? { name: file.name, spans: parsed } : null);
  };

  const downloadSrt = () => {
    const url = URL.createObjectURL(new Blob([toSrt(projectCaptions, fps)], { type: 'application/x-subrip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.srt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

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

        {imported ? (
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5">
            <FileText size={14} className="text-sky-400 shrink-0" />
            <span id="captions-file" className="flex-1 truncate text-neutral-200">
              {t('captions.file', { name: imported.name })}
            </span>
            <button onClick={() => setImported(null)} className="text-[10px] text-sky-400 hover:text-sky-300">
              {t('captions.backToScript')}
            </button>
          </div>
        ) : (
          <textarea
            id="captions-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={7}
            placeholder={t('captions.placeholder')}
            className={`${inputClass} w-full resize-y font-mono`}
          />
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            id="captions-file-input"
            type="file"
            accept=".srt,.vtt,text/vtt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
          >
            <FileText size={12} /> {t('captions.import')}
          </button>
          {importError && <span className="text-[10px] text-rose-400">{t('captions.importError')}</span>}
        </div>

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
          {imported
            ? t('captions.fileTiming')
            : t('captions.timing', { from: seconds(fromFrame), to: seconds(toFrame), markers: usedMarkers })}
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
            setImported(null);
          }}
          className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-neutral-950 font-bold"
        >
          {t('captions.create', { count: spans.length })}
        </button>

        <button
          id="captions-download-btn"
          disabled={projectCaptions.length === 0}
          onClick={downloadSrt}
          title={t('captions.downloadHint')}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 border border-neutral-800 text-neutral-200"
        >
          <Download size={13} /> {t('captions.download', { count: projectCaptions.length })}
        </button>
      </div>
    </div>
  );
};
