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
