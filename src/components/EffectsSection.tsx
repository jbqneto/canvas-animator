/**
 * Effects block of the motion inspector: shadow, glow, blur and tint. Numbers follow the stopwatch
 * rule like the transform properties (static value in `effects`, keys in `tracks`); colors are static.
 */
import React from 'react';
import { Timer } from 'lucide-react';
import type { Animated, EffectParams, EffectProp } from '../types';
import { useI18n } from '../i18n';
import { actorPropertyValue, isAnimated, setActorProperty, toggleAnimated } from '../engine/actor';
import { DEFAULT_EFFECTS, EFFECT_GROUPS, EFFECT_PROPS } from '../engine/effects';
import { hasKeyframeAt, removeKeyframe, setKeyframe, Track } from '../engine/keyframes';
import { canvasFilterSupported } from '../utils/effectsRender';

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-orange-500 outline-none';

type ColorKey = 'shadowColor' | 'glowColor' | 'tintColor';
const GROUP_COLOR: Partial<Record<string, ColorKey>> = { shadow: 'shadowColor', glow: 'glowColor', tint: 'tintColor' };
const EFFECT_PROP_IDS = Object.keys(EFFECT_PROPS) as EffectProp[];

interface EffectsSectionProps<T extends Animated> {
  obj: T;
  currentFrame: number;
  onChange: (obj: T, description: string) => void;
}

export const EffectsSection = <T extends Animated>({ obj, currentFrame, onChange }: EffectsSectionProps<T>) => {
  const { t } = useI18n();
  const track = (prop: EffectProp) => obj.tracks[prop] as Track<number> | undefined;
  const value = (prop: EffectProp) => actorPropertyValue(obj, prop, currentFrame) as number;
  const anyActive = EFFECT_GROUPS.some((g) => value(g.trigger) > 0);

  const setValue = (prop: EffectProp, v: number, label: string) => {
    const { min, max } = EFFECT_PROPS[prop];
    const clamped = Math.min(max, Math.max(min, v));
    onChange(
      setActorProperty(obj, prop, currentFrame, clamped),
      isAnimated(obj, prop)
        ? t('actor.history.key', { label, frame: currentFrame })
        : t('actor.history.change', { label })
    );
  };

  const toggleKeyHere = (prop: EffectProp, label: string) => {
    const current = track(prop);
    if (hasKeyframeAt(current, currentFrame)) {
      onChange(
        { ...obj, tracks: { ...obj.tracks, [prop]: removeKeyframe(current, currentFrame) } },
        t('actor.history.removeKey', { label })
      );
    } else {
      onChange(
        { ...obj, tracks: { ...obj.tracks, [prop]: setKeyframe(current as Track<number>, currentFrame, value(prop)) } },
        t('actor.history.addKey', { label })
      );
    }
  };

  const setColor = (key: ColorKey, color: string) => {
    const effects: EffectParams = { ...(obj.effects ?? DEFAULT_EFFECTS), [key]: color };
    onChange({ ...obj, effects }, t('fx.history.color'));
  };

  return (
    <details className="space-y-2 pt-2 border-t border-neutral-800" data-fx-section open={anyActive || undefined}>
      <summary className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider cursor-pointer">
        {t('fx.title')}
      </summary>
      <div className="space-y-3 pt-2">
        {EFFECT_GROUPS.map((group) => {
          const active = value(group.trigger) > 0;
          const colorKey = GROUP_COLOR[group.id];
          const effects = obj.effects ?? DEFAULT_EFFECTS;
          return (
            <div key={group.id} className="space-y-1.5" data-fx-group={group.id}>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-neutral-200 font-medium flex-1">{t(`fx.group.${group.id}`)}</span>
                {colorKey && (
                  <input
                    type="color"
                    data-fx-color={colorKey}
                    title={t('fx.color')}
                    aria-label={t('fx.color')}
                    value={effects[colorKey]}
                    onChange={(e) => setColor(colorKey, e.target.value)}
                    className="w-6 h-5 bg-transparent border border-neutral-800 rounded cursor-pointer"
                  />
                )}
                <button
                  type="button"
                  data-fx-toggle={group.id}
                  aria-pressed={active}
                  title={t('fx.toggle')}
                  onClick={() =>
                    setValue(group.trigger, active ? 0 : group.onValue, t(`fx.prop.${group.trigger}`))
                  }
                  className={`px-1.5 py-0.5 rounded text-[10px] border ${
                    active ? 'bg-orange-500 border-orange-400 text-white' : 'border-neutral-700 text-neutral-400 hover:text-white'
                  }`}
                >
                  {t('fx.toggle')}
                </button>
              </div>
              {group.id === 'blur' && !canvasFilterSupported() && (
                <p className="text-[10px] text-amber-400" data-fx-blur-hint>{t('fx.blurUnsupported')}</p>
              )}
              {EFFECT_PROP_IDS.filter((p) => EFFECT_PROPS[p].group === group.id).map((prop) => {
                const label = t(`fx.prop.${prop}`);
                const animated = isAnimated(obj, prop);
                const keyAtFrame = hasKeyframeAt(track(prop), currentFrame);
                const { min, max, step } = EFFECT_PROPS[prop];
                return (
                  <div key={prop} className="flex items-center gap-1.5" data-fx-prop={prop}>
                    <button
                      type="button"
                      data-fx-stopwatch={prop}
                      onClick={() =>
                        onChange(
                          toggleAnimated(obj, prop, currentFrame),
                          animated ? t('actor.history.stopAnimating', { label }) : t('actor.history.animate', { label })
                        )
                      }
                      title={animated ? t('actor.stopwatchOff') : t('actor.stopwatchOn')}
                      className={`p-0.5 rounded ${animated ? 'text-orange-400' : 'text-neutral-500 hover:text-white'}`}
                    >
                      <Timer size={13} />
                    </button>
                    <span className="text-[10px] text-neutral-400 flex-1">{label}</span>
                    <input
                      type="number"
                      data-fx-input={prop}
                      min={min}
                      max={max}
                      step={step}
                      value={Number(value(prop).toFixed(2))}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (e.target.value !== '' && Number.isFinite(n)) setValue(prop, n, label);
                      }}
                      className={`${inputClass} w-20`}
                    />
                    {animated && (
                      <button
                        type="button"
                        data-fx-key={prop}
                        onClick={() => toggleKeyHere(prop, label)}
                        title={keyAtFrame ? t('actor.removeKeyHere') : t('actor.addKeyHere')}
                        className={`w-2.5 h-2.5 shrink-0 rotate-45 border ${
                          keyAtFrame ? 'bg-amber-400 border-amber-300' : 'border-neutral-500 hover:border-amber-400'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </details>
  );
};
