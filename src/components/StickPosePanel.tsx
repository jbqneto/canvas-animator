/**
 * Pose of a stick figure as an animated property: a stopwatch like the transform properties (off = one
 * rest pose, on = pose keys interpolated bone by bone), key navigation, the easing towards the next
 * pose and the pose library, applied at the current frame.
 */
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FlipHorizontal2, Save, Timer, Trash2, User, Zap } from 'lucide-react';
import type { StickActor } from '../types';
import { MessageKey, useI18n } from '../i18n';
import { DEFAULT_EASING, EASING_NAMES, EasingName, hasKeyframeAt, setKeyframeEasing } from '../engine/keyframes';
import { applyPose, hasPoseKeys, localFigure, mirrorPose, samplePose, setPose, togglePoseKey, togglePoseTrack } from '../engine/stickActor';
import { deleteUserPose, readUserPoses, saveUserPose, USER_POSES_CHANGED } from '../utils/userPoses';
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

  // Poses the user saved in this browser ("My poses"), shared by every figure and project
  const [userPoses, setUserPoses] = useState(readUserPoses);
  const [poseName, setPoseName] = useState('');
  useEffect(() => {
    const sync = () => setUserPoses(readUserPoses());
    window.addEventListener(USER_POSES_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(USER_POSES_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /** Sets the pose seen at the current frame (stopwatch rule), with a history label. */
  const changePose = (joints: typeof stick.joints, label: string) =>
    onChange(
      setPose(stick, currentFrame, joints),
      animated ? t('stickPose.history.keyPreset', { pose: label, frame: currentFrame }) : t('stickPose.history.preset', { pose: label })
    );

  const applyPreset = (key: string) => {
    const figure = applyPoseToStickFigure(localFigure(stick, samplePose(stick, currentFrame)), key);
    changePose(figure.joints, t(`pose.${key}.name` as MessageKey));
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

      <button
        onClick={() => changePose(mirrorPose(samplePose(stick, currentFrame)), t('stickPose.mirrorName'))}
        title={t('stickPose.mirrorHint')}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 transition"
        data-pose-mirror
      >
        <FlipHorizontal2 size={12} className="text-amber-400" />
        {t('stickPose.mirror')}
      </button>

      {/* My poses: saved from the current pose, applied like the ready-made ones */}
      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block pt-1">
        {t('stickPose.myPoses')}
      </span>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (saveUserPose(poseName, samplePose(stick, currentFrame))) setPoseName('');
        }}
        className="flex gap-1.5"
      >
        <input
          value={poseName}
          onChange={(e) => setPoseName(e.target.value)}
          placeholder={t('stickPose.namePlaceholder')}
          className={motionInputClass}
          data-pose-name
        />
        <button
          type="submit"
          disabled={!poseName.trim()}
          title={t('stickPose.saveHint')}
          className="shrink-0 flex items-center gap-1 px-2 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-40"
        >
          <Save size={12} />
          {t('stickPose.save')}
        </button>
      </form>
      {userPoses.length === 0 ? (
        <p className="text-[10px] text-neutral-500">{t('stickPose.myPosesEmpty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1" data-user-poses>
          {userPoses.map((pose) => (
            <div key={pose.id} className="flex items-center rounded bg-neutral-900 border border-neutral-800">
              <button
                onClick={() => changePose(applyPose(samplePose(stick, currentFrame), pose.joints), pose.name)}
                className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 text-neutral-300 hover:text-white text-left"
              >
                <User size={11} className="text-amber-400 shrink-0" />
                <span className="truncate">{pose.name}</span>
              </button>
              <button
                onClick={() => deleteUserPose(pose.id)}
                title={t('stickPose.deletePose', { name: pose.name })}
                className="p-1 text-neutral-500 hover:text-rose-400"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
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
