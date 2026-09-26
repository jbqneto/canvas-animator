import React, { useEffect, useState } from 'react';
import { Link2, Unlink, Route as RouteIcon } from 'lucide-react';
import type { ActorOverlay, MotionPath } from '../types';
import { actorPropertyValue } from '../engine/actor';
import { buildFollowProgress, samplePath } from '../engine/path';
import {
  DEFAULT_EASING,
  EASING_NAMES,
  EasingName,
  hasKeyframeAt,
  removeKeyframe,
  sampleTrack,
  setKeyframe,
} from '../engine/keyframes';
import { useI18n } from '../i18n';

interface ActorFollowPanelProps {
  actor: ActorOverlay;
  paths: MotionPath[];
  currentFrame: number;
  fps: number;
  onChange: (actor: ActorOverlay, description: string) => void;
  onAttach: (actorId: string, pathId: string) => void;
  onSelectPath: (pathId: string) => void;
}

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs text-white focus:border-sky-500 outline-none';

/**
 * "Seguir caminho": links the actor to a drawn path and controls how it travels it.
 * Timing is regular keyframes on a 0–100% progress track, so it can also be edited by hand
 * (pauses, going back, different speeds) and retimed on the timeline.
 */
export const ActorFollowPanel: React.FC<ActorFollowPanelProps> = ({
  actor,
  paths,
  currentFrame,
  fps,
  onChange,
  onAttach,
  onSelectPath,
}) => {
  const { t } = useI18n();
  const follow = actor.follow;
  const path = follow ? paths.find((p) => p.id === follow.pathId) : undefined;
  const [pickId, setPickId] = useState('');

  const keys = follow?.progress ?? [];
  const firstFrame = keys[0]?.frame ?? actor.startFrame;
  const lastFrame = keys[keys.length - 1]?.frame ?? actor.startFrame + actor.durationFrames;
  const [start, setStart] = useState(firstFrame);
  const [end, setEnd] = useState(lastFrame);
  const [easing, setEasing] = useState<EasingName>(keys[0]?.easing ?? DEFAULT_EASING);
  const [stopSeconds, setStopSeconds] = useState(0);
  useEffect(() => {
    setStart(firstFrame);
    setEnd(lastFrame);
  }, [actor.id, firstFrame, lastFrame]);

  if (!follow || !path) {
    return (
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">{t('follow.title')}</span>
        {paths.length === 0 ? (
          <p className="text-[10px] text-neutral-500">
            <RouteIcon size={10} className="inline" /> {t('follow.noPaths')}
          </p>
        ) : (
          <div className="flex gap-1.5">
            <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={inputClass}>
              <option value="">{t('follow.choosePath')}</option>
              {paths.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              disabled={!pickId}
              onClick={() => onAttach(actor.id, pickId)}
              className="px-2 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 disabled:opacity-40 flex items-center gap-1 text-[11px]"
            >
              <Link2 size={12} /> {t('follow.follow')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const progressNow = sampleTrack(follow.progress, currentFrame, 0);
  const keyHere = hasKeyframeAt(follow.progress, currentFrame);
  const setFollow = (patch: Partial<typeof follow>, description: string) =>
    onChange({ ...actor, follow: { ...follow, ...patch } }, description);

  const applyTiming = () => {
    const holdFrames = Math.round(stopSeconds * fps);
    setFollow(
      {
        progress: buildFollowProgress({
          anchorProgress: samplePath(path).anchorProgress,
          startFrame: Math.max(1, start),
          endFrame: Math.max(start + 1, end),
          easing,
          holdFrames,
        }),
      },
      holdFrames > 0 ? t('follow.history.timingStops') : t('follow.history.timing')
    );
  };

  return (
    <div className="space-y-2 rounded border border-sky-500/30 bg-sky-500/5 p-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => onSelectPath(path.id)}
          title={t('follow.selectPath')}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 hover:text-sky-200"
        >
          <RouteIcon size={13} /> {t('follow.following', { name: path.name })}
        </button>
        <button
          onClick={() => {
            // Unlink but stay where it is now
            const here = actorPropertyValue(actor, 'position', currentFrame, paths);
            onChange(
              { ...actor, follow: undefined, tracks: { ...actor.tracks, position: [] }, base: { ...actor.base, ...here } },
              t('follow.history.unlink')
            );
          }}
          title={t('follow.unlink')}
          className="p-1 rounded text-neutral-400 hover:text-rose-300"
        >
          <Unlink size={13} />
        </button>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
        <input
          type="checkbox"
          checked={follow.orient}
          onChange={(e) => setFollow({ orient: e.target.checked }, t('follow.history.orient'))}
          className="accent-sky-500"
        />
        {t('follow.orient')}
      </label>

      {/* Quick timing: whole path between two frames, optionally stopping at each point */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px] text-neutral-400">
        <label className="space-y-0.5">
          <span>{t('follow.departs')}</span>
          <input type="number" min={1} value={start} onChange={(e) => setStart(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="space-y-0.5">
          <span>{t('follow.arrives')}</span>
          <input type="number" min={1} value={end} onChange={(e) => setEnd(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="space-y-0.5">
          <span>{t('follow.motion')}</span>
          <select value={easing} onChange={(e) => setEasing(e.target.value as EasingName)} className={inputClass}>
            {EASING_NAMES.filter((o) => o !== 'hold').map((o) => (
              <option key={o} value={o}>
                {t(`easing.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5">
          <span>{t('follow.stopSeconds')}</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={stopSeconds}
            onChange={(e) => setStopSeconds(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </label>
      </div>
      <button
        onClick={applyTiming}
        className="w-full py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 text-[11px]"
      >
        {stopSeconds > 0
          ? t('follow.applyWithStops', { count: path.points.length - 2 })
          : t('follow.apply')}
      </button>

      {/* Fine control: progress keyframe at the current frame */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-neutral-400">
          <span>{t('follow.progressAt', { frame: currentFrame })}</span>
          <button
            onClick={() =>
              setFollow(
                {
                  progress: keyHere
                    ? removeKeyframe(follow.progress, currentFrame)
                    : setKeyframe(follow.progress, currentFrame, progressNow),
                },
                keyHere ? t('follow.history.removeProgressKey') : t('follow.history.progressKey')
              )
            }
            title={keyHere ? t('actor.removeKeyHere') : t('actor.addKeyHere')}
            className={`w-2.5 h-2.5 rotate-45 border ${
              keyHere ? 'bg-amber-400 border-amber-300' : 'border-neutral-500 hover:border-amber-400'
            }`}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={Math.round(progressNow * 1000) / 10}
            onChange={(e) =>
              setFollow(
                { progress: setKeyframe(follow.progress, currentFrame, Number(e.target.value) / 100) },
                t('follow.history.progress', { value: e.target.value, frame: currentFrame })
              )
            }
            className="w-full accent-sky-500"
          />
          <span className="w-10 text-right font-mono text-[10px] text-neutral-300">{Math.round(progressNow * 100)}%</span>
        </div>
      </div>
    </div>
  );
};
