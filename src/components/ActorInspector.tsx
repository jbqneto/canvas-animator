import React from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Timer, Trash2 } from 'lucide-react';
import type { ActorOverlay, MotionPath } from '../types';
import { ActorFollowPanel } from './ActorFollowPanel';
import { MessageKey, useI18n } from '../i18n';
import {
  ActorProperty,
  actorHasKeyAt,
  actorKeyframes,
  actorPropertyValue,
  isAnimated,
  setActorProperty,
  toggleAnimated,
  followedPath,
} from '../engine/actor';
import {
  EASING_NAMES,
  EasingName,
  DEFAULT_EASING,
  hasKeyframeAt,
  removeKeyframe,
  setKeyframe,
  setKeyframeEasing,
  Track,
} from '../engine/keyframes';

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

const PROPS: { id: ActorProperty; labelKey: MessageKey }[] = [
  { id: 'position', labelKey: 'actor.prop.position' },
  { id: 'scale', labelKey: 'actor.prop.scale' },
  { id: 'rotation', labelKey: 'actor.prop.rotation' },
  { id: 'opacity', labelKey: 'actor.prop.opacity' },
];

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-orange-500 outline-none';

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
  const following = !!followedPath(actor, paths);
  const track = (prop: ActorProperty) => actor.tracks[prop] as Track<unknown> | undefined;
  const keyFrames = actorKeyframes(actor);
  const prevKey = [...keyFrames].reverse().find((f) => f < currentFrame);
  const nextKey = keyFrames.find((f) => f > currentFrame);
  const keyHere = actorHasKeyAt(actor, currentFrame);

  // Easing shown for the keys at the current frame (they share one when set from here)
  const easingHere = (() => {
    for (const tr of [...PROPS.map((p) => track(p.id)), actor.follow?.progress]) {
      const k = tr?.find((key) => key.frame === currentFrame);
      if (k) return k.easing ?? DEFAULT_EASING;
    }
    return null;
  })();

  const setValue = (prop: ActorProperty, value: any, label: string) => {
    onChange(
      setActorProperty(actor, prop, currentFrame, value),
      isAnimated(actor, prop)
        ? t('actor.history.key', { label, frame: currentFrame })
        : t('actor.history.change', { label })
    );
  };

  /** Diamond button: add a key with the current value, or remove the key at this frame. */
  const toggleKeyHere = (prop: ActorProperty, label: string) => {
    const current = track(prop);
    if (hasKeyframeAt(current, currentFrame)) {
      const tracks = { ...actor.tracks, [prop]: removeKeyframe(current, currentFrame) };
      onChange({ ...actor, tracks }, t('actor.history.removeKey', { label }));
    } else {
      const value = actorPropertyValue(actor, prop, currentFrame);
      const tracks = { ...actor.tracks, [prop]: setKeyframe(current as Track<any>, currentFrame, value) };
      onChange({ ...actor, tracks }, t('actor.history.addKey', { label }));
    }
  };

  const setEasingHere = (easing: EasingName) => {
    const tracks = { ...actor.tracks };
    (Object.keys(tracks) as ActorProperty[]).forEach((p) => {
      (tracks as any)[p] = setKeyframeEasing(tracks[p] as Track<any>, currentFrame, easing);
    });
    const follow = actor.follow && {
      ...actor.follow,
      progress: setKeyframeEasing(actor.follow.progress, currentFrame, easing),
    };
    onChange({ ...actor, tracks, follow }, t('actor.history.easing', { frame: currentFrame }));
  };

  const pos = actorPropertyValue(actor, 'position', currentFrame, paths);
  const scale = actorPropertyValue(actor, 'scale', currentFrame);
  const rotation = actorPropertyValue(actor, 'rotation', currentFrame);
  const opacity = actorPropertyValue(actor, 'opacity', currentFrame);
  const endFrame = actor.startFrame + actor.durationFrames;
  const onScreen = currentFrame >= actor.startFrame && currentFrame <= endFrame;

  const renderEditor = (prop: ActorProperty, label: string) => {
    switch (prop) {
      case 'position':
        return (
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center gap-1 text-[10px] text-neutral-500">
              X
              <input
                type="number"
                value={Math.round(pos.x)}
                onChange={(e) => setValue('position', { x: Number(e.target.value), y: pos.y }, label)}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-neutral-500">
              Y
              <input
                type="number"
                value={Math.round(pos.y)}
                onChange={(e) => setValue('position', { x: pos.x, y: Number(e.target.value) }, label)}
                className={inputClass}
              />
            </label>
          </div>
        );
      case 'scale':
        return (
          <label className="flex items-center gap-1 text-[10px] text-neutral-500">
            <input
              type="number"
              step={5}
              value={Math.round(scale * 100)}
              onChange={(e) => setValue('scale', Math.max(0, Number(e.target.value)) / 100, label)}
              className={inputClass}
            />
            %
          </label>
        );
      case 'rotation':
        return (
          <label className="flex items-center gap-1 text-[10px] text-neutral-500">
            <input
              type="number"
              step={5}
              value={Math.round(rotation)}
              onChange={(e) => setValue('rotation', Number(e.target.value), label)}
              className={inputClass}
            />
            °
          </label>
        );
      case 'opacity':
        return (
          <label className="flex items-center gap-1 text-[10px] text-neutral-500">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => setValue('opacity', Number(e.target.value) / 100, label)}
              className="w-full accent-orange-500"
            />
            <span className="w-8 text-right font-mono text-neutral-300">{Math.round(opacity * 100)}%</span>
          </label>
        );
    }
  };

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

      {/* Keyframe navigation (After Effects style) */}
      <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded p-1.5">
        <button
          disabled={prevKey === undefined}
          onClick={() => prevKey !== undefined && onJumpToFrame(prevKey)}
          title={t('actor.prevKey')}
          className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[10px] text-neutral-400">
          {t('actor.frameInfo')} <b className="text-white font-mono">{currentFrame}</b> ({(currentFrame / fps).toFixed(2)}s){' '}
          {keyHere ? <span className="text-amber-400">{t('actor.hasKey')}</span> : <span>{t('actor.noKey')}</span>}
        </span>
        <button
          disabled={nextKey === undefined}
          onClick={() => nextKey !== undefined && onJumpToFrame(nextKey)}
          title={t('actor.nextKey')}
          className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-30"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Animatable properties */}
      <div className="space-y-2.5">
        <ActorFollowPanel
          actor={actor}
          paths={paths}
          currentFrame={currentFrame}
          fps={fps}
          onChange={onChange}
          onAttach={onAttachToPath}
          onSelectPath={onSelectPath}
        />
        {PROPS.filter(({ id }) => !(following && id === 'position')).map(({ id, labelKey }) => {
          const label = t(labelKey);
          const animated = isAnimated(actor, id);
          const keyAtFrame = hasKeyframeAt(track(id), currentFrame);
          return (
            <div key={id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() =>
                    onChange(
                      toggleAnimated(actor, id, currentFrame),
                      animated ? t('actor.history.stopAnimating', { label }) : t('actor.history.animate', { label })
                    )
                  }
                  title={
                    animated
                      ? t('actor.stopwatchOff')
                      : t('actor.stopwatchOn')
                  }
                  className={`p-0.5 rounded ${animated ? 'text-orange-400' : 'text-neutral-500 hover:text-white'}`}
                >
                  <Timer size={13} />
                </button>
                <span className="text-[11px] text-neutral-300 font-medium flex-1">{label}</span>
                {animated && (
                  <button
                    onClick={() => toggleKeyHere(id, label)}
                    title={keyAtFrame ? t('actor.removeKeyHere') : t('actor.addKeyHere')}
                    className={`w-2.5 h-2.5 rotate-45 border ${
                      keyAtFrame ? 'bg-amber-400 border-amber-300' : 'border-neutral-500 hover:border-amber-400'
                    }`}
                  />
                )}
              </div>
              {renderEditor(id, label)}
            </div>
          );
        })}
      </div>

      {easingHere && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
            {t('actor.easingFromKey')}
          </span>
          <select
            value={easingHere}
            onChange={(e) => setEasingHere(e.target.value as EasingName)}
            className={inputClass}
          >
            {EASING_NAMES.map((o) => (
              <option key={o} value={o}>
                {t(`easing.${o}`)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Motion path options */}
      <div className="space-y-1.5 pt-2 border-t border-neutral-800">
        <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
          {t('actor.motionOptions')}
        </span>
        {(
          [
            ['smoothPath', t('actor.opt.smoothPath')],
            ['orientToPath', t('actor.opt.orientToPath')],
            ['flipX', t('actor.opt.flipX')],
          ] as const
        )
          // The keyframe-path options don't apply while following a drawn path
          .filter(([key]) => !following || key === 'flipX').map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={actor[key]}
              onChange={(e) => onChange({ ...actor, [key]: e.target.checked }, label)}
              className="accent-orange-500"
            />
            {label}
          </label>
        ))}
      </div>

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
