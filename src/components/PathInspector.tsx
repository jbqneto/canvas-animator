import React, { useState } from 'react';
import { Link2, Route as RouteIcon, Trash2 } from 'lucide-react';
import type { ActorOverlay, MotionPath, PathStrokeStyle } from '../types';
import { samplePath } from '../engine/path';
import { MessageKey, useI18n } from '../i18n';

interface PathInspectorProps {
  path: MotionPath;
  actors: ActorOverlay[];
  totalFrames: number;
  onChange: (path: MotionPath, description: string) => void;
  onDelete: (id: string) => void;
  /** Links an actor to this path with default timing (the path's time span). */
  onAttachActor: (actorId: string, pathId: string) => void;
  onSelectActor: (actorId: string) => void;
}

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs text-white focus:border-sky-500 outline-none';
const sectionTitle = 'text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block';

const STROKES: { id: PathStrokeStyle; label: MessageKey }[] = [
  { id: 'dotted', label: 'path.stroke.dotted' },
  { id: 'dashed', label: 'path.stroke.dashed' },
  { id: 'solid', label: 'path.stroke.solid' },
];

export const PathInspector: React.FC<PathInspectorProps> = ({
  path,
  actors,
  totalFrames,
  onChange,
  onDelete,
  onAttachActor,
  onSelectActor,
}) => {
  const { t } = useI18n();
  const followers = actors.filter((a) => a.follow?.pathId === path.id);
  const candidates = actors.filter((a) => a.follow?.pathId !== path.id);
  const [attachId, setAttachId] = useState('');
  const setStyle = (style: Partial<MotionPath['style']>, description: string) =>
    onChange({ ...path, style: { ...path.style, ...style } }, description);
  const length = Math.round(samplePath(path).length);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <RouteIcon size={16} />
          </div>
          <input
            value={path.name}
            onChange={(e) => onChange({ ...path, name: e.target.value }, t('path.history.rename'))}
            className="bg-transparent font-bold text-white text-xs outline-none border-b border-transparent focus:border-sky-500 min-w-0"
          />
        </div>
        <button
          onClick={() => onDelete(path.id)}
          title={t('path.delete')}
          className="p-1.5 rounded hover:bg-rose-950/40 text-neutral-400 hover:text-rose-400 transition"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Who follows this path */}
      <div className="space-y-1.5">
        <span className={sectionTitle}>{t('path.followers')}</span>
        {followers.length === 0 && (
          <p className="text-[10px] text-neutral-500">{t('path.noFollowers')}</p>
        )}
        {followers.map((a) => (
          <button
            key={a.id}
            onClick={() => onSelectActor(a.id)}
            className="w-full text-left px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-orange-300 hover:border-orange-500/60"
          >
            {t('path.editFollower', { name: a.name })}
          </button>
        ))}
        {candidates.length > 0 ? (
          <div className="flex gap-1.5">
            <select value={attachId} onChange={(e) => setAttachId(e.target.value)} className={inputClass}>
              <option value="">{t('path.chooseImage')}</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              disabled={!attachId}
              onClick={() => {
                onAttachActor(attachId, path.id);
                setAttachId('');
              }}
              title={t('path.attachHint')}
              className="px-2 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 disabled:opacity-40 flex items-center gap-1 text-[11px]"
            >
              <Link2 size={12} /> {t('follow.follow')}
            </button>
          </div>
        ) : (
          followers.length === 0 && (
            <p className="text-[10px] text-neutral-500">{t('path.importFirst')}</p>
          )
        )}
      </div>

      {/* Appearance */}
      <div className="space-y-2 pt-2 border-t border-neutral-800">
        <span className={sectionTitle}>{t('path.appearance')}</span>
        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={path.style.visible}
            onChange={(e) => setStyle({ visible: e.target.checked }, t('path.history.visibility'))}
            className="accent-sky-500"
          />
          {t('path.showLine')}
        </label>
        {path.style.visible && (
          <>
            <div className="grid grid-cols-3 gap-1">
              {STROKES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle({ stroke: s.id }, t('path.history.stroke'))}
                  className={`py-1 rounded border text-[11px] ${
                    path.style.stroke === s.id
                      ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <input
                type="color"
                value={path.style.color}
                onChange={(e) => setStyle({ color: e.target.value }, t('path.history.color'))}
                className="w-7 h-7 bg-transparent border-0 cursor-pointer"
              />
              {t('path.width')}
              <input
                type="number"
                min={1}
                max={40}
                value={path.style.width}
                onChange={(e) => setStyle({ width: Math.max(1, Number(e.target.value)) }, t('path.history.width'))}
                className="w-14 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 font-mono text-white"
              />
              px
            </div>
            <select
              value={path.style.reveal}
              onChange={(e) => setStyle({ reveal: e.target.value as MotionPath['style']['reveal'] }, t('path.history.reveal'))}
              className={inputClass}
            >
              <option value="full">{t('path.reveal.full')}</option>
              <option value="follow">{t('path.reveal.follow')}</option>
            </select>
          </>
        )}
      </div>

      {/* Shape */}
      <div className="space-y-1.5 pt-2 border-t border-neutral-800">
        <span className={sectionTitle}>{t('path.shape')}</span>
        <p className="text-[10px] text-neutral-500">
          {t('path.shapeInfo', { points: path.points.length, length })}
        </p>
        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={path.smooth}
            onChange={(e) => onChange({ ...path, smooth: e.target.checked }, t('path.history.smooth'))}
            className="accent-sky-500"
          />
          {t('path.smooth')}
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={path.closed}
            onChange={(e) => onChange({ ...path, closed: e.target.checked }, t('path.history.closed'))}
            className="accent-sky-500"
          />
          {t('path.closed')}
        </label>
        <button
          disabled={path.points.length <= 2}
          onClick={() => onChange({ ...path, points: path.points.slice(0, -1) }, t('path.removeLast'))}
          className="w-full py-1 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-400 hover:text-white disabled:opacity-40"
        >
          {t('path.removeLast')}
        </button>
      </div>

      {/* Time span of the visible line */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800">
        <label className="text-[10px] text-neutral-400 space-y-1">
          <span>{t('path.visibleFrom')}</span>
          <input
            type="number"
            min={1}
            max={totalFrames}
            value={path.startFrame}
            onChange={(e) => onChange({ ...path, startFrame: Math.max(1, Number(e.target.value)) }, t('path.history.start'))}
            className={inputClass}
          />
        </label>
        <label className="text-[10px] text-neutral-400 space-y-1">
          <span>{t('path.duration')}</span>
          <input
            type="number"
            min={1}
            value={path.durationFrames}
            onChange={(e) => onChange({ ...path, durationFrames: Math.max(1, Number(e.target.value)) }, t('path.history.duration'))}
            className={inputClass}
          />
        </label>
      </div>
    </div>
  );
};
