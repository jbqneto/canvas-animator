import { ChartOverlay, TextOverlay } from '../types';

/**
 * Calculates normalized easing (0..1) based on type
 */
export function calculateEasing(
  progress: number,
  easing: 'easeOut' | 'easeInOut' | 'linear' | 'bounce' = 'easeOut'
): number {
  const p = Math.max(0, Math.min(1, progress));
  if (easing === 'linear') {
    return p;
  }
  if (easing === 'easeInOut') {
    return p < 0.5
      ? 4 * p * p * p
      : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
  if (easing === 'bounce') {
    const c4 = (2 * Math.PI) / 3;
    return p === 0
      ? 0
      : p === 1
      ? 1
      : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
  }
  // Default: Smooth cubic ease-out
  return 1 - Math.pow(1 - p, 3);
}

/**
 * Gets interpolated position and progress for a Chart at a specific frame
 */
export function getChartCurrentState(chart: ChartOverlay, currentFrame: number) {
  const endFrame = chart.startFrame + chart.durationFrames;
  const isVisible =
    chart.visible &&
    currentFrame >= chart.startFrame &&
    currentFrame <= endFrame;

  const elapsed = currentFrame - chart.startFrame;
  // If user sets duration to 60, animation runs 60 frames. If set to 120, it runs 120 frames!
  const animDuration = chart.animDurationFrames || chart.durationFrames || 30;
  const rawProgress = Math.max(0, Math.min(1, elapsed / Math.max(1, animDuration)));
  const easeProgress = calculateEasing(rawProgress, chart.easing || 'easeOut');

  // Motion Tween position (Posição 1 -> Posição 2)
  let x = chart.x;
  let y = chart.y;
  if (chart.hasMotionTween && chart.endX !== undefined && chart.endY !== undefined) {
    const motionProgress = Math.max(
      0,
      Math.min(1, elapsed / Math.max(1, chart.durationFrames))
    );
    const motionEase = calculateEasing(motionProgress, chart.easing || 'easeOut');
    x = chart.x + (chart.endX - chart.x) * motionEase;
    y = chart.y + (chart.endY - chart.y) * motionEase;
  }

  return {
    x,
    y,
    rawProgress,
    easeProgress,
    isVisible,
  };
}

/**
 * Gets interpolated position and progress for a Text overlay at a specific frame
 */
export function getTextCurrentState(text: TextOverlay, currentFrame: number) {
  const endFrame = text.startFrame + text.durationFrames;
  const isVisible =
    text.visible &&
    currentFrame >= text.startFrame &&
    currentFrame <= endFrame;

  const elapsed = currentFrame - text.startFrame;
  const animDuration = text.animDurationFrames || text.durationFrames || 30;
  const rawProgress = Math.max(0, Math.min(1, elapsed / Math.max(1, animDuration)));
  const easeProgress = calculateEasing(rawProgress, text.easing || 'easeOut');

  let x = text.x;
  let y = text.y;
  if (text.hasMotionTween && text.endX !== undefined && text.endY !== undefined) {
    const motionProgress = Math.max(
      0,
      Math.min(1, elapsed / Math.max(1, text.durationFrames))
    );
    const motionEase = calculateEasing(motionProgress, text.easing || 'easeOut');
    x = text.x + (text.endX - text.x) * motionEase;
    y = text.y + (text.endY - text.y) * motionEase;
  }

  return {
    x,
    y,
    rawProgress,
    easeProgress,
    isVisible,
  };
}
