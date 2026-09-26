import React from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import type { ActorOverlay, MotionPath } from '../types';
import { useI18n } from '../i18n';
import { MotionInspector, motionInputClass as inputClass } from './MotionInspector';

interface ActorInspectorProps {
  actor: ActorOverlay;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  onChange: (actor: ActorOverlay, description: string) => void;
  onDelete: (id: string) => void;
  onJumpToFrame: (frame: number) => void;
  paths: MotionPath[];
  onAttachToPath: (actorId: string, pathId: string) => void;
  onSelectPath: (pathId: string) => void;
}

export const ActorInspector: React.FC<ActorInspectorProps> = ({
  actor,
  currentFrame,
  totalFrames,
  fps,
  onChange,
  onDelete,
  onJumpToFrame,
  paths,
  onAttachToPath,
  onSelectPath,
}) => {
  const { t } = useI18n();
  const endFrame = actor.startFrame + actor.durationFrames;
  const onScreen = currentFrame >= actor.startFrame && currentFrame <= endFrame;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
            <ImageIcon size={16} />
          </div>
          <input
            value={actor.name}
            onChange={(e) => onChange({ ...actor, name: e.target.value }, t('actor.history.rename'))}
            className="bg-transparent font-bold text-white text-xs outline-none border-b border-transparent focus:border-orange-500 min-w-0"
          />
        </div>
        <button
          onClick={() => onDelete(actor.id)}
          title={t('actor.delete')}
          className="p-1.5 rounded hover:bg-rose-950/40 text-neutral-400 hover:text-rose-400 transition"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {!onScreen && (
        <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
          {t('actor.offscreen', { start: actor.startFrame, end: endFrame })}
        </p>
      )}

      <MotionInspector
        obj={actor}
        currentFrame={currentFrame}
        fps={fps}
        onChange={onChange}
        onJumpToFrame={onJumpToFrame}
        paths={paths}
        onAttachToPath={onAttachToPath}
        onSelectPath={onSelectPath}
      />

      <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
        <input
          type="checkbox"
          checked={actor.flipX}
          onChange={(e) => onChange({ ...actor, flipX: e.target.checked }, t('actor.opt.flipX'))}
          className="accent-orange-500"
        />
        {t('actor.opt.flipX')}
      </label>

      {/* Trail (travelled path) */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={!!actor.trail?.enabled}
            onChange={(e) =>
              onChange(
                {
                  ...actor,
                  trail: {
                    color: '#f8fafc',
                    width: 4,
                    dashed: true,
                    ...actor.trail,
                    enabled: e.target.checked,
                  },
                },
                t('actor.history.trail')
              )
            }
            className="accent-orange-500"
          />
          {t('actor.trail')}
        </label>
        {actor.trail?.enabled && (
          <div className="flex items-center gap-2 pl-5 text-[10px] text-neutral-400">
            <input
              type="color"
              value={actor.trail.color}
              onChange={(e) => onChange({ ...actor, trail: { ...actor.trail!, color: e.target.value } }, t('actor.history.trailColor'))}
              className="w-6 h-6 bg-transparent border-0 cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={30}
              value={actor.trail.width}
              onChange={(e) =>
                onChange({ ...actor, trail: { ...actor.trail!, width: Math.max(1, Number(e.target.value)) } }, t('actor.history.trailWidth'))
              }
              className="w-12 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 font-mono text-white"
            />
            px
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={actor.trail.dashed}
                onChange={(e) => onChange({ ...actor, trail: { ...actor.trail!, dashed: e.target.checked } }, t('actor.history.trailDashed'))}
                className="accent-orange-500"
              />
              {t('actor.trailDashed')}
            </label>
          </div>
        )}
      </div>

      {/* Time span & base size */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800">
        <label className="text-[10px] text-neutral-400 space-y-1">
          <span>{t('actor.startFrame')}</span>
          <input
            type="number"
            min={1}
            max={totalFrames}
            value={actor.startFrame}
            onChange={(e) =>
              onChange({ ...actor, startFrame: Math.max(1, Number(e.target.value)) }, t('actor.history.startFrame'))
            }
            className={inputClass}
          />
        </label>
        <label className="text-[10px] text-neutral-400 space-y-1">
          <span>{t('actor.duration')}</span>
          <input
            type="number"
            min={1}
            value={actor.durationFrames}
            onChange={(e) =>
              onChange({ ...actor, durationFrames: Math.max(1, Number(e.target.value)) }, t('actor.history.duration'))
            }
            className={inputClass}
          />
        </label>
        <label className="text-[10px] text-neutral-400 space-y-1 col-span-2">
          <span>{t('actor.baseWidth')}</span>
          <input
            type="number"
            min={4}
            value={Math.round(actor.width)}
            onChange={(e) => {
              const width = Math.max(4, Number(e.target.value));
              onChange(
                { ...actor, width, height: (actor.height / actor.width) * width },
                t('actor.history.baseSize')
              );
            }}
            className={inputClass}
          />
        </label>
      </div>
    </div>
  );
};
