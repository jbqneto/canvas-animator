import { describe, expect, it } from 'vitest';
import { calculateEasing, formatNumberBR, parseLocaleNumber } from '../motionUtils';

describe('parseLocaleNumber', () => {
  it.each([
    ['4,5', 4.5, 1],
    ['4.5', 4.5, 1],
    ['1.000', 1000, 0],
    ['2.500.000', 2500000, 0],
    ['1.000,50', 1000.5, 2],
    ['1,000.50', 1000.5, 2],
    ['R$ 12,3%', 12.3, 1],
    ['-3,25', -3.25, 2],
    ['85', 85, 0],
  ])('%s -> %d (%d decimals)', (input, value, decimals) => {
    expect(parseLocaleNumber(input)).toEqual({ value, decimals });
  });

  it('returns null for non-numeric input', () => {
    expect(parseLocaleNumber('abc')).toBeNull();
  });
});

describe('formatNumberBR', () => {
  it('uses pt-BR separators', () => {
    expect(formatNumberBR(1234.5, 1)).toBe('1.234,5');
    expect(formatNumberBR(15400, 0)).toBe('15.400');
  });
});

describe('calculateEasing', () => {
  it.each(['linear', 'easeOut', 'easeInOut', 'bounce'] as const)('%s starts at 0 and ends at 1', (e) => {
    expect(calculateEasing(0, e)).toBeCloseTo(0);
    expect(calculateEasing(1, e)).toBeCloseTo(1);
  });

  it('clamps progress outside 0..1', () => {
    expect(calculateEasing(-1, 'linear')).toBe(0);
    expect(calculateEasing(2, 'linear')).toBe(1);
  });
});
