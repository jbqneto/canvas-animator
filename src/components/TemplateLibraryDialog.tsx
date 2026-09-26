/**
 * Template library: pick a template, fill its parameters (form generated from `params`) and watch a
 * live preview drawn by the same renderer as the stage and the export.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Globe2, LayoutTemplate, MousePointer2, Type, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { TEMPLATES } from '../templates/library';
import {
  AnimationTemplate,
  defaultValues,
  TemplateCategory,
  TemplateOutput,
  TemplateParam,
  TemplateValues,
} from '../templates/types';
import { renderCompositeFrame, SceneContent } from '../utils/exportVideo';
import { onImageLoaded } from '../utils/imageCache';

interface TemplateLibraryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (template: AnimationTemplate, values: TemplateValues) => void;
  /** The map route has its own dialog (country search); the library just opens it. */
  onOpenMapRoute: () => void;
  width: number;
  height: number;
  fps: number;
  currentFrame: number;
}

const MAP_ROUTE_ID = 'mapRoute';
const CATEGORIES: { id: TemplateCategory; icon: React.ReactNode }[] = [
  { id: 'titles', icon: <Type size={13} /> },
  { id: 'data', icon: <BarChart3 size={13} /> },
  { id: 'highlight', icon: <MousePointer2 size={13} /> },
  { id: 'maps', icon: <Globe2 size={13} /> },
];

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:border-sky-500 outline-none';

/** Loops the template's animation on a canvas at the project size (scaled down by CSS). */
const Preview: React.FC<{ output: TemplateOutput | null; width: number; height: number; fps: number }> = ({
  output,
  width,
  height,
  fps,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [imageTick, setImageTick] = useState(0);
  useEffect(() => onImageLoaded(() => setImageTick((n) => n + 1)), []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !output) return;
    const ctx = canvas.getContext('2d')!;
    const scene: SceneContent = {
      frames: {},
      charts: output.charts,
      texts: output.texts,
      images: [],
      actors: output.actors,
      paths: output.paths,
      layers: [],
      videoBg: { type: 'color', color: '#0b1120', opacity: 1, playbackRate: 1 },
      videoElement: null,
    };
    // Play the whole template, rest half a second, repeat
    const loop = output.endFrame + Math.round(fps * 0.5);
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const frame = 1 + (Math.floor(((now - start) / 1000) * fps) % loop);
      renderCompositeFrame(ctx, width, height, frame, scene);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [output, width, height, fps, imageTick]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      data-template-preview
      className="w-full max-h-[34vh] object-contain rounded-lg border border-neutral-800 bg-neutral-950"
    />
  );
};

export const TemplateLibraryDialog: React.FC<TemplateLibraryDialogProps> = ({
  isOpen,
  onClose,
  onInsert,
  onOpenMapRoute,
  width,
  height,
  fps,
  currentFrame,
}) => {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].id);
  // Edited values per template (kept while switching); defaults follow the interface language
  const [edited, setEdited] = useState<Record<string, TemplateValues>>({});
  useEffect(() => setEdited({}), [locale]);

  const template = TEMPLATES.find((tpl) => tpl.id === selectedId) ?? null;
  const values = template ? (edited[template.id] ?? defaultValues(template, t)) : {};
  const setValue = (key: string, value: string | number) =>
    template && setEdited((prev) => ({ ...prev, [template.id]: { ...values, [key]: value } }));

  const previewOutput = useMemo(
    () => (template ? template.build(values, { width, height, fps, startFrame: 1, idPrefix: 'preview' }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, JSON.stringify(values), width, height, fps]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderParam = (p: TemplateParam) => {
    const value = values[p.key];
    const label = <span className="text-[10px] text-neutral-400 block mb-1">{t(p.labelKey)}</span>;
    switch (p.type) {
      case 'lines':
        return (
          <label key={p.key} className="block col-span-2">
            {label}
            <textarea
              data-param={p.key}
              rows={4}
              value={String(value ?? '')}
              onChange={(e) => setValue(p.key, e.target.value)}
              className={`${inputClass} font-mono resize-y`}
            />
          </label>
        );
      case 'number':
        return (
          <label key={p.key} className="block">
            {label}
            <input
              data-param={p.key}
              type="number"
              min={p.min}
              max={p.max}
              step={p.step}
              value={Number(value)}
              onChange={(e) => setValue(p.key, Number(e.target.value))}
              className={`${inputClass} font-mono`}
            />
          </label>
        );
      case 'color':
        return (
          <label key={p.key} className="block">
            {label}
            <input
              data-param={p.key}
              type="color"
              value={String(value)}
              onChange={(e) => setValue(p.key, e.target.value)}
              className="w-full h-7 bg-neutral-900 border border-neutral-800 rounded cursor-pointer"
            />
          </label>
        );
      case 'select':
        return (
          <label key={p.key} className="block">
            {label}
            <select data-param={p.key} value={String(value)} onChange={(e) => setValue(p.key, e.target.value)} className={inputClass}>
              {p.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
        );
      case 'text':
      default:
        return (
          <label key={p.key} className="block col-span-2">
            {label}
            <input
              data-param={p.key}
              value={String(value ?? '')}
              onChange={(e) => setValue(p.key, e.target.value)}
              className={inputClass}
            />
          </label>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t('templates.dialogTitle')}
        className="w-[940px] max-w-[95vw] max-h-[90vh] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl flex flex-col text-xs"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={16} className="text-sky-400" />
            <h3 className="text-sm font-bold text-white">{t('templates.dialogTitle')}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Templates by category */}
          <nav className="w-56 shrink-0 border-r border-neutral-800 p-3 space-y-3 overflow-y-auto">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {cat.icon}
                  {t(`templates.category.${cat.id}`)}
                </div>
                {TEMPLATES.filter((tpl) => tpl.category === cat.id).map((tpl) => (
                  <button
                    key={tpl.id}
                    data-template={tpl.id}
                    onClick={() => setSelectedId(tpl.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition border ${
                      selectedId === tpl.id ? 'bg-sky-500/20 text-white border-sky-500/50' : 'text-neutral-300 hover:bg-neutral-800 border-transparent'
                    }`}
                  >
                    {t(tpl.nameKey)}
                  </button>
                ))}
                {cat.id === 'maps' && (
                  <button data-template={MAP_ROUTE_ID} onClick={() => setSelectedId(MAP_ROUTE_ID)} className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition border ${
                      selectedId === MAP_ROUTE_ID ? 'bg-sky-500/20 text-white border-sky-500/50' : 'text-neutral-300 hover:bg-neutral-800 border-transparent'
                    }`}>
                    {t('route.title')}
                  </button>
                )}
              </div>
            ))}
          </nav>

          {/* Preview + parameters */}
          <div className="flex-1 min-w-0 p-4 space-y-3 overflow-y-auto">
            {template ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold text-white">{t(template.nameKey)}</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">{t(template.descriptionKey)}</p>
                </div>
                <Preview output={previewOutput} width={width} height={height} fps={fps} />
                <div className="grid grid-cols-2 gap-2.5">{template.params.map(renderParam)}</div>
                <p className="text-[10px] text-neutral-500">{t('templates.dialogHint')}</p>
                <button
                  id="template-insert-btn"
                  onClick={() => onInsert(template, values)}
                  className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold"
                >
                  {t('templates.insert', { frame: currentFrame })}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">{t('route.title')}</h4>
                <p className="text-[11px] text-neutral-400">{t('route.description')}</p>
                <button
                  onClick={onOpenMapRoute}
                  className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold"
                >
                  {t('templates.mapRoute.open')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
