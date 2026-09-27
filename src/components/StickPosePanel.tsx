/**
 * Pose of a stick figure as an animated property: a stopwatch like the transform properties (off = one
 * rest pose, on = pose keys interpolated bone by bone), key navigation, the easing towards the next
 * pose and the pose library, applied at the current frame.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Timer, Zap } from 'lucide-react';
import type { StickActor } from '../types';
import { MessageKey, useI18n } from '../i18n';
import { DEFAULT_EASING, EASING_NAMES, EasingName, hasKeyframeAt, setKeyframeEasing } from '../engine/keyframes';
import { hasPoseKeys, localFigure, samplePose, setPose, togglePoseKey, togglePoseTrack } from '../engine/stickActor';
import { STICK_POSE_PRESETS, applyPoseToStickFigure } from '../utils/stickFigurePresets';
import { motionInputClass } from './MotionInspector';

interface StickPosePanelProps {
  stick: StickActor;
  currentFrame: number;
  onChange: (stick: StickActor, description: string) => void;
  onJumpToFrame: (frame: number) => void;
}

export const StickPosePanel: React.FC<StickPosePanelProps> = ({ stick, currentFrame, onChange, onJumpToFrame }) => {
  const { t } = useI18n();
  const animated = hasPoseKeys(stick);
  const keyFrames = stick.poses.map((k) => k.frame);
  const prevKey = [...keyFrames].reverse().find((f) => f < currentFrame);
  const nextKey = keyFrames.find((f) => f > currentFrame);
  const keyHere = hasKeyframeAt(stick.poses, currentFrame);
  const easingHere = stick.poses.find((k) => k.frame === currentFrame)?.easing ?? DEFAULT_EASING;

  const applyPreset = (key: string) => {
    const figure = applyPoseToStickFigure(localFigure(stick, samplePose(stick, currentFrame)), key);
    const label = t(`pose.${key}.name` as MessageKey);
    onChange(
      setPose(stick, currentFrame, figure.joints),
      animated ? t('stickPose.history.keyPreset', { pose: label, frame: currentFrame }) : t('stickPose.history.preset', { pose: label })
    );
  };

  return (
    <div className="space-y-2" data-stick-pose>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() =>
            onChange(
              togglePoseTrack(stick, currentFrame),
              animated ? t('stickPose.history.stop') : t('stickPose.history.animate')
            )
          }
          title={animated ? t('actor.stopwatchOff') : t('actor.stopwatchOn')}
          className={`p-0.5 rounded ${animated ? 'text-orange-400' : 'text-neutral-500 hover:text-white'}`}
          data-pose-stopwatch
        >
          <Timer size={13} />
        </button>
        <span className="text-[11px] text-neutral-300 font-medium flex-1">{t('stickPose.label')}</span>
        {animated && (
          <>
            <button
              disabled={prevKey === undefined}
              onClick={() => prevKey !== undefined && onJumpToFrame(prevKey)}
              title={t('stickPose.prevKey')}
              className="p-0.5 rounded text-neutral-400 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() =>
                onChange(
                  togglePoseKey(stick, currentFrame),
                  keyHere
                    ? t('stickPose.history.removeKey', { frame: currentFrame })
                    : t('stickPose.history.addKey', { frame: currentFrame })
                )
              }
              title={keyHere ? t('actor.removeKeyHere') : t('actor.addKeyHere')}
              className={`w-2.5 h-2.5 rotate-45 border ${
                keyHere ? 'bg-amber-400 border-amber-300' : 'border-neutral-500 hover:border-amber-400'
              }`}
              data-pose-key
            />
            <button
              disabled={nextKey === undefined}
              onClick={() => nextKey !== undefined && onJumpToFrame(nextKey)}
              title={t('stickPose.nextKey')}
              className="p-0.5 rounded text-neutral-400 hover:text-white disabled:opacity-30"
            >
              <ChevronRight size={13} />
            </button>
          </>
        )}
      </div>

      <p className="text-[10px] text-neutral-500 leading-snug">
        {animated ? t('stickPose.helpAnimated', { count: keyFrames.length }) : t('stickPose.helpStatic')}
      </p>

      {keyHere && (
        <label className="flex items-center gap-2 text-[10px] text-neutral-400">
          <span className="shrink-0">{t('stickPose.easing')}</span>
          <select
            value={easingHere}
            onChange={(e) =>
              onChange(
                { ...stick, poses: setKeyframeEasing(stick.poses, currentFrame, e.target.value as EasingName) },
                t('actor.history.easing', { frame: currentFrame })
              )
            }
            className={motionInputClass}
          >
            {EASING_NAMES.map((o) => (
              <option key={o} value={o}>
                {t(`easing.${o}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block pt-1">
        {t('inspector.stick.poses')}
      </span>
      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {Object.keys(STICK_POSE_PRESETS).map((key) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-left transition"
          >
            <Zap size={11} className="text-amber-400 shrink-0" />
            <span className="truncate" title={t(`pose.${key}.desc` as MessageKey)}>
              {t(`pose.${key}.name` as MessageKey)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
