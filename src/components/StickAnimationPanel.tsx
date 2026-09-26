import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Wand2 } from 'lucide-react';
import type { FrameData } from '../types';
import { EASING_NAMES, EasingName, DEFAULT_EASING } from '../engine/keyframes';
import { useI18n } from '../i18n';

interface StickAnimationPanelProps {
  stickId: string;
  frames: Record<number, FrameData>;
  currentFrame: number;
  totalFrames: number;
  onCopyToFrame: (stickId: string, toFrame: number) => void;
  onTween: (stickId: string, fromFrame: number, toFrame: number, easing: EasingName) => void;
}

const inputClass =
  'w-14 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-amber-500 outline-none';

/**
 * Flash "classic tween" workflow for stick figures: pose frame A, copy the figure to frame B, pose it
 * there, then generate the in-betweens.
 */
export const StickAnimationPanel: React.FC<StickAnimationPanelProps> = ({
  stickId,
  frames,
  currentFrame,
  totalFrames,
  onCopyToFrame,
  onTween,
}) => {
  const { t } = useI18n();
  // Frames where this figure was posed by hand (key poses)
  const keyPoses = useMemo(
    () =>
      Object.values(frames)
        .filter((f) => f.stickFigures.some((s) => s.id === stickId && !s.tweened))
        .map((f) => f.frameNumber)
        .sort((a, b) => a - b),
    [frames, stickId]
  );

  const [copyTo, setCopyTo] = useState(Math.min(totalFrames, currentFrame + 12));
  const [from, setFrom] = useState(currentFrame);
  const [to, setTo] = useState(currentFrame + 12);
  const [easing, setEasing] = useState<EasingName>(DEFAULT_EASING);

  // Sensible defaults whenever the playhead or the figure changes: tween from the key pose at/before
  // the playhead to the next key pose after it.
  useEffect(() => {
    const prev = [...keyPoses].reverse().find((f) => f <= currentFrame) ?? currentFrame;
    const next = keyPoses.find((f) => f > prev + 1);
    setFrom(prev);
    setTo(next ?? Math.min(totalFrames, prev + 12));
    setCopyTo(Math.min(totalFrames, currentFrame + 12));
  }, [currentFrame, stickId, keyPoses, totalFrames]);

  const canTween = to > from + 1 && keyPoses.includes(from) && keyPoses.includes(to);

  return (
    <div className="space-y-2 pt-2 border-t border-neutral-800">
      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">
        {t('stickAnim.title')}
      </span>
      <p className="text-[10px] text-neutral-500 leading-snug">
        {t('stickAnim.help')}
      </p>

      <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
        <span className="flex-1">{t('stickAnim.copyTo')}</span>
        <input
          type="number"
          min={1}
          max={totalFrames}
          value={copyTo}
          onChange={(e) => setCopyTo(Number(e.target.value))}
          className={inputClass}
        />
        <button
          onClick={() => onCopyToFrame(stickId, Math.max(1, Math.min(totalFrames, copyTo)))}
          title={t('stickAnim.copyHint')}
          className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-amber-300"
        >
          <Copy size={12} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
        <span>{t('stickAnim.from')}</span>
        <input type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass} />
        <span>{t('stickAnim.to')}</span>
        <input type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} className={inputClass} />
      </div>
      <select
        value={easing}
        onChange={(e) => setEasing(e.target.value as EasingName)}
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-xs text-white"
      >
        {EASING_NAMES.map((o) => (
          <option key={o} value={o}>
            {t(`easing.${o}`)}
          </option>
        ))}
      </select>
      <button
        disabled={!canTween}
        onClick={() => onTween(stickId, from, to, easing)}
        title={
          canTween
            ? t('stickAnim.tweenHint', { from: from + 1, to: to - 1 })
            : t('stickAnim.tweenDisabled')
        }
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Wand2 size={13} />
        {t('stickAnim.tween')}
      </button>
      {keyPoses.length > 0 && (
        <p className="text-[10px] text-neutral-500">
          {t('stickAnim.keyPoses')} {keyPoses.slice(0, 12).map((f) => `F${f}`).join(', ')}
          {keyPoses.length > 12 && ` … (+${keyPoses.length - 12})`}
        </p>
      )}
    </div>
  );
};
