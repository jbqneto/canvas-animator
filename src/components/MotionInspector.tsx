/**
 * Keyframed transform of any animated object (actor, chart, text), After Effects style: position,
 * scale, rotation and opacity with a stopwatch each, key navigation, easing of the key under the
 * playhead, curved path / orient options and "follow a drawn path".
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import type { Animated, MotionPath } from '../types';
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

type MotionObject = Animated & { id: string };

interface MotionInspectorProps<T extends MotionObject> {
  obj: T;
  currentFrame: number;
  fps: number;
  onChange: (obj: T, description: string) => void;
  onJumpToFrame: (frame: number) => void;
  paths: MotionPath[];
  onAttachToPath: (id: string, pathId: string) => void;
  onSelectPath: (pathId: string) => void;
}

const PROPS: { id: ActorProperty; labelKey: MessageKey }[] = [
  { id: 'position', labelKey: 'actor.prop.position' },
  { id: 'scale', labelKey: 'actor.prop.scale' },
  { id: 'rotation', labelKey: 'actor.prop.rotation' },
  { id: 'opacity', labelKey: 'actor.prop.opacity' },
];

export const motionInputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-orange-500 outline-none';

export const MotionInspector = <T extends MotionObject>({
  obj,
  currentFrame,
  fps,
  onChange,
  onJumpToFrame,
  paths,
  onAttachToPath,
  onSelectPath,
}: MotionInspectorProps<T>) => {
  const { t } = useI18n();
  const following = !!followedPath(obj, paths);
  const track = (prop: ActorProperty) => obj.tracks[prop] as Track<unknown> | undefined;
  const keyFrames = actorKeyframes(obj);
  const prevKey = [...keyFrames].reverse().find((f) => f < currentFrame);
  const nextKey = keyFrames.find((f) => f > currentFrame);
  const keyHere = actorHasKeyAt(obj, currentFrame);

  // Easing shown for the keys at the current frame (they share one when set from here)
  const easingHere = (() => {
    for (const tr of [...PROPS.map((p) => track(p.id)), obj.follow?.progress]) {
      const k = tr?.find((key) => key.frame === currentFrame);
      if (k) return k.easing ?? DEFAULT_EASING;
    }
    return null;
  })();

  const setValue = (prop: ActorProperty, value: any, label: string) => {
    onChange(
      setActorProperty(obj, prop, currentFrame, value),
      isAnimated(obj, prop)
        ? t('actor.history.key', { label, frame: currentFrame })
        : t('actor.history.change', { label })
    );
  };

  /** Diamond button: add a key with the current value, or remove the key at this frame. */
  const toggleKeyHere = (prop: ActorProperty, label: string) => {
    const current = track(prop);
    if (hasKeyframeAt(current, currentFrame)) {
      const tracks = { ...obj.tracks, [prop]: removeKeyframe(current, currentFrame) };
      onChange({ ...obj, tracks }, t('actor.history.removeKey', { label }));
    } else {
      const value = actorPropertyValue(obj, prop, currentFrame);
      const tracks = { ...obj.tracks, [prop]: setKeyframe(current as Track<any>, currentFrame, value) };
      onChange({ ...obj, tracks }, t('actor.history.addKey', { label }));
    }
  };

  const setEasingHere = (easing: EasingName) => {
    const tracks = { ...obj.tracks };
    (Object.keys(tracks) as ActorProperty[]).forEach((p) => {
      (tracks as any)[p] = setKeyframeEasing(tracks[p] as Track<any>, currentFrame, easing);
    });
    const follow = obj.follow && {
      ...obj.follow,
      progress: setKeyframeEasing(obj.follow.progress, currentFrame, easing),
    };
    onChange({ ...obj, tracks, follow }, t('actor.history.easing', { frame: currentFrame }));
  };

  const pos = actorPropertyValue(obj, 'position', currentFrame, paths);
  const scale = actorPropertyValue(obj, 'scale', currentFrame);
  const rotation = actorPropertyValue(obj, 'rotation', currentFrame);
  const opacity = actorPropertyValue(obj, 'opacity', currentFrame);

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
                className={motionInputClass}
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-neutral-500">
              Y
              <input
                type="number"
                value={Math.round(pos.y)}
                onChange={(e) => setValue('position', { x: pos.x, y: Number(e.target.value) }, label)}
                className={motionInputClass}
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
              className={motionInputClass}
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
              className={motionInputClass}
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
    <div className="space-y-4" data-motion-inspector>
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
          actor={obj}
          paths={paths}
          currentFrame={currentFrame}
          fps={fps}
          onChange={onChange}
          onAttach={onAttachToPath}
          onSelectPath={onSelectPath}
        />
        {PROPS.filter(({ id }) => !(following && id === 'position')).map(({ id, labelKey }) => {
          const label = t(labelKey);
          const animated = isAnimated(obj, id);
          const keyAtFrame = hasKeyframeAt(track(id), currentFrame);
          return (
            <div key={id} className="space-y-1" data-motion-prop={id}>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() =>
                    onChange(
                      toggleAnimated(obj, id, currentFrame),
                      animated ? t('actor.history.stopAnimating', { label }) : t('actor.history.animate', { label })
                    )
                  }
                  title={animated ? t('actor.stopwatchOff') : t('actor.stopwatchOn')}
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
            className={motionInputClass}
          >
            {EASING_NAMES.map((o) => (
              <option key={o} value={o}>
                {t(`easing.${o}`)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Keyframe-path options (they don't apply while following a drawn path) */}
      {!following && (
        <div className="space-y-1.5 pt-2 border-t border-neutral-800">
          <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
            {t('actor.motionOptions')}
          </span>
          {(
            [
              ['smoothPath', t('actor.opt.smoothPath')],
              ['orientToPath', t('actor.opt.orientToPath')],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={obj[key]}
                onChange={(e) => onChange({ ...obj, [key]: e.target.checked }, label)}
                className="accent-orange-500"
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
