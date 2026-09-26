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

/**
 * Parses a user-typed number that may use pt-BR ("4,5" / "1.000,50") or en-US ("4.5" / "1,000.50")
 * separators. Returns the value and how many decimal places were typed, or null if not numeric.
 */
export function parseLocaleNumber(input: string): { value: number; decimals: number } | null {
  const cleaned = input.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let decimalSep: ',' | '.' | null = null;
  if (lastComma !== -1 && lastDot !== -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma !== -1) {
    // "1,000" (single group of 3 digits) is ambiguous; treat a lone comma as decimal (pt-BR)
    decimalSep = /^-?\d{1,3}(,\d{3}){2,}$/.test(cleaned) ? null : ',';
  } else if (lastDot !== -1) {
    // "1.000" / "2.500.000" are thousand groups in pt-BR, "4.5" is a decimal
    decimalSep = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned) ? null : '.';
  }

  let intPart = cleaned;
  let fracPart = '';
  if (decimalSep) {
    const idx = cleaned.lastIndexOf(decimalSep);
    intPart = cleaned.slice(0, idx);
    fracPart = cleaned.slice(idx + 1).replace(/[.,]/g, '');
  }
  intPart = intPart.replace(/[.,]/g, '');

  const value = Number(`${intPart || '0'}.${fracPart || '0'}`);
  if (!Number.isFinite(value)) return null;
  return { value, decimals: fracPart.length };
}

/** Formats a number with a fixed number of decimals using pt-BR separators. */
export function formatNumberBR(value: number, decimals: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
