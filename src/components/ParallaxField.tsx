/**
 * How much the scene camera moves an object (parallax): 1 follows it fully, 0 pins the object to the
 * screen (logo, HUD), below 1 reads as a distant layer and above 1 as a foreground one.
 */
import React from 'react';
import type { Animated } from '../types';
import { useI18n } from '../i18n';
import { PARALLAX, parallaxOf } from '../engine/camera';

interface ParallaxFieldProps<T extends Animated> {
  obj: T;
  onChange: (obj: T, description: string) => void;
}

export const ParallaxField = <T extends Animated>({ obj, onChange }: ParallaxFieldProps<T>) => {
  const { t } = useI18n();
  const value = parallaxOf(obj);
  const set = (v: number) => {
    const next = Math.min(PARALLAX.max, Math.max(PARALLAX.min, Math.round(v * 100) / 100));
    const { parallax: _drop, ...rest } = obj;
    onChange((next === PARALLAX.default ? rest : { ...rest, parallax: next }) as T, t('parallax.history', { value: next }));
  };
  return (
    <label className="flex items-center gap-2 pt-2 border-t border-neutral-800 text-[11px] text-neutral-300" title={t('parallax.hint')}>
      <span className="flex-1 font-medium">{t('parallax.label')}</span>
      <input
        data-parallax-input
        type="number"
        min={PARALLAX.min}
        max={PARALLAX.max}
        step={0.1}
        value={value}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) set(v);
        }}
        className="w-16 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-orange-500 outline-none"
      />
    </label>
  );
};
