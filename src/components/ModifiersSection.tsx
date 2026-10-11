/**
 * Loop and shake of the transform properties (After Effects' loopOut and wiggle), in the motion
 * inspector. Both act on the keys the property already has; the section starts open when any is set.
 */
import React from 'react';
import type { Animated, ModifiableProperty, PropertyModifier } from '../types';
import { useI18n } from '../i18n';
import { cleanModifier, MODIFIABLE_PROPERTIES, SHAKE_LIMITS, SHAKE_PERIOD } from '../engine/modifiers';

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-orange-500 outline-none';

interface ModifiersSectionProps<T extends Animated> {
  obj: T;
  onChange: (obj: T, description: string) => void;
}

export const ModifiersSection = <T extends Animated>({ obj, onChange }: ModifiersSectionProps<T>) => {
  const { t } = useI18n();
  const mods = obj.modifiers ?? {};
  const [open, setOpen] = React.useState(Object.keys(mods).length > 0);

  const update = (prop: ModifiableProperty, patch: Partial<PropertyModifier> | { shake: null }) => {
    const current = mods[prop] ?? {};
    const merged = { ...current, ...patch } as PropertyModifier & { shake?: PropertyModifier['shake'] | null };
    if (merged.shake === null) delete merged.shake;
    const cleaned = cleanModifier(prop, merged as PropertyModifier);
    const next = { ...mods };
    if (cleaned) next[prop] = cleaned;
    else delete next[prop];
    const { modifiers: _drop, ...rest } = obj;
    onChange(
      (Object.keys(next).length ? { ...rest, modifiers: next } : rest) as T,
      t('mod.history', { label: t(`mod.prop.${prop}`) })
    );
  };

  const setShake = (prop: ModifiableProperty, amount: number, period: number) => {
    if (!(amount > 0)) return update(prop, { shake: null });
    update(prop, { shake: { amount, periodFrames: period } });
  };

  return (
    <details className="space-y-2 pt-2 border-t border-neutral-800" data-mod-section open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider cursor-pointer" title={t('mod.hint')}>
        {t('mod.title')}
      </summary>
      <div className="space-y-2 pt-2">
        {MODIFIABLE_PROPERTIES.map((prop) => {
          const mod = mods[prop];
          const amount = mod?.shake?.amount ?? 0;
          const period = mod?.shake?.periodFrames ?? SHAKE_PERIOD.default;
          return (
            <div key={prop} className="space-y-1" data-mod-prop={prop}>
              <span className="text-[11px] text-neutral-200 font-medium">{t(`mod.prop.${prop}`)}</span>
              <div className="grid grid-cols-3 gap-1.5 text-[10px] text-neutral-400">
                <label className="space-y-0.5">
                  <span>{t('mod.loop')}</span>
                  <select
                    data-mod-loop={prop}
                    value={mod?.loop ?? ''}
                    onChange={(e) => update(prop, { loop: (e.target.value || undefined) as PropertyModifier['loop'] })}
                    className={inputClass}
                  >
                    <option value="">{t('mod.loop.none')}</option>
                    <option value="cycle">{t('mod.loop.cycle')}</option>
                    <option value="pingpong">{t('mod.loop.pingpong')}</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span>{t('mod.shake')}</span>
                  <input
                    data-mod-amount={prop}
                    type="number"
                    min={0}
                    max={SHAKE_LIMITS[prop].max}
                    step={SHAKE_LIMITS[prop].step}
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (Number.isFinite(v)) setShake(prop, v, period);
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="space-y-0.5">
                  <span>{t('mod.period')}</span>
                  <input
                    data-mod-period={prop}
                    type="number"
                    min={SHAKE_PERIOD.min}
                    max={SHAKE_PERIOD.max}
                    step={1}
                    value={period}
                    disabled={amount <= 0}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (Number.isFinite(v)) setShake(prop, amount, v);
                    }}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
};
