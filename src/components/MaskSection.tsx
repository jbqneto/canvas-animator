/**
 * Mask of an object: a shape actor flagged "use as mask" cuts it (inside or outside the shape).
 * Starts open when a mask is set.
 */
import React from 'react';
import type { Animated, MaskRef } from '../types';
import { useI18n } from '../i18n';

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-orange-500 outline-none';

interface MaskSectionProps<T extends Animated & { id: string }> {
  obj: T;
  maskActors: { id: string; name: string }[];
  onChange: (obj: T, description: string) => void;
}

export const MaskSection = <T extends Animated & { id: string }>({ obj, maskActors, onChange }: MaskSectionProps<T>) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(!!obj.mask);
  const options = maskActors.filter((a) => a.id !== obj.id);
  const current = obj.mask?.actorId ?? '';
  const missing = !!current && !options.some((a) => a.id === current);

  const apply = (mask: MaskRef | null) => {
    const { mask: _drop, ...rest } = obj;
    onChange((mask ? { ...rest, mask } : rest) as T, t('mask.history'));
  };

  return (
    <details className="space-y-2 pt-2 border-t border-neutral-800" data-mask-section open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider cursor-pointer" title={t('mask.use.hint')}>
        {t('mask.title')}
      </summary>
      <div className="grid grid-cols-2 gap-1.5 pt-2 text-[10px] text-neutral-400">
        <select
          data-mask-actor
          value={current}
          onChange={(e) => apply(e.target.value ? { actorId: e.target.value, mode: obj.mask?.mode ?? 'inside' } : null)}
          className={inputClass}
        >
          <option value="">{t('mask.none')}</option>
          {missing && <option value={current}>{t('mask.missing')}</option>}
          {options.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {obj.mask && (
          <select
            data-mask-mode
            value={obj.mask.mode}
            onChange={(e) => apply({ actorId: obj.mask!.actorId, mode: e.target.value as MaskRef['mode'] })}
            className={inputClass}
          >
            <option value="inside">{t('mask.mode.inside')}</option>
            <option value="outside">{t('mask.mode.outside')}</option>
          </select>
        )}
      </div>
    </details>
  );
};
