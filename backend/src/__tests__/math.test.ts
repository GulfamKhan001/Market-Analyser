import { describe, it, expect } from 'vitest';
import {
  mean, std, percentile, quantile, cumulative, cumulativeMax,
  dailyReturns, rollingMean, correlation, correlationMatrix,
  covarianceMatrix, choleskyDecompose, normalRandom, normalRandomArray,
  matVecMultiply, ensurePSD, round, clip, safeFloat,
} from '../utils/math';

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('calculates mean of integers', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('calculates mean of floats', () => {
    expect(mean([1.5, 2.5, 3.5])).toBeCloseTo(2.5);
  });

  it('handles single element', () => {
    expect(mean([42])).toBe(42);
  });

  it('handles negative numbers', () => {
    expect(mean([-2, -1, 0, 1, 2])).toBe(0);
  });
});

describe('std', () => {
  it('returns 0 for single element', () => {
    expect(std([5])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(std([])).toBe(0);
  });

  it('calculates population std (ddof=0)', () => {
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1);
  });

  it('calculates sample std (ddof=1)', () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    const result = std(data, 1);
    expect(result).toBeCloseTo(2.1380899, 4);
  });

  it('returns 0 for constant array', () => {
    expect(std([3, 3, 3, 3])).toBe(0);
  });
});

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns median for p=50', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('returns min for p=0', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it('returns max for p=100', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it('interpolates between values', () => {
    expect(percentile([1, 2, 3, 4], 25)).toBe(1.75);
  });

  it('handles unsorted input', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
  });
});

describe('quantile', () => {
  it('quantile(arr, 0.5) equals percentile(arr, 50)', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(quantile(arr, 0.5)).toBe(percentile(arr, 50));
  });

  it('quantile(arr, 0.25) equals percentile(arr, 25)', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(quantile(arr, 0.25)).toBe(percentile(arr, 25));
  });
});

describe('cumulative', () => {
  it('returns empty for empty input', () => {
    expect(cumulative([])).toEqual([]);
  });

  it('calculates cumulative product of (1+r)', () => {
    expect(cumulative([0.1, 0.2, -0.1])).toEqual([
      1.1,
      1.1 * 1.2,
      1.1 * 1.2 * 0.9,
    ]);
  });

  it('handles zero returns', () => {
    expect(cumulative([0, 0, 0])).toEqual([1, 1, 1]);
  });
});

describe('cumulativeMax', () => {
  it('tracks running maximum', () => {
    expect(cumulativeMax([1, 3, 2, 5, 4])).toEqual([1, 3, 3, 5, 5]);
  });

  it('handles empty input', () => {
    expect(cumulativeMax([])).toEqual([]);
  });

  it('handles descending values', () => {
    expect(cumulativeMax([5, 4, 3, 2, 1])).toEqual([5, 5, 5, 5, 5]);
  });
});

describe('dailyReturns', () => {
  it('returns empty for single price', () => {
    expect(dailyReturns([100])).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(dailyReturns([])).toEqual([]);
  });

  it('calculates returns correctly', () => {
    const prices = [100, 110, 105, 115.5];
    const returns = dailyReturns(prices);
    expect(returns[0]).toBeCloseTo(0.1);
    expect(returns[1]).toBeCloseTo(-0.04545, 4);
    expect(returns[2]).toBeCloseTo(0.1, 4);
  });

  it('handles zero price gracefully', () => {
    expect(dailyReturns([0, 100])).toEqual([0]);
  });
});

describe('rollingMean', () => {
  it('returns null for insufficient window', () => {
    const result = rollingMean([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2);
    expect(result[3]).toBeCloseTo(3);
    expect(result[4]).toBeCloseTo(4);
  });

  it('window=1 returns original values', () => {
    expect(rollingMean([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('correlation', () => {
  it('perfect positive correlation', () => {
    expect(correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1.0);
  });

  it('perfect negative correlation', () => {
    expect(correlation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1.0);
  });

  it('zero correlation for constant array', () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
  });

  it('returns 0 for arrays < 2 elements', () => {
    expect(correlation([1], [2])).toBe(0);
  });

  it('handles different length arrays (uses min)', () => {
    const c = correlation([1, 2, 3], [2, 4, 6, 8, 10]);
    expect(c).toBeCloseTo(1.0);
  });
});

describe('correlationMatrix', () => {
  it('returns identity for single ticker', () => {
    const { matrix } = correlationMatrix({ A: [0.01, 0.02, -0.01] });
    expect(matrix).toEqual([[1]]);
  });

  it('diagonal is all 1s', () => {
    const { matrix } = correlationMatrix({
      A: [0.01, 0.02, -0.01, 0.03],
      B: [0.02, -0.01, 0.01, 0.02],
    });
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
  });

  it('is symmetric', () => {
    const { matrix } = correlationMatrix({
      A: [0.01, 0.02, -0.01, 0.03],
      B: [0.02, -0.01, 0.01, 0.02],
    });
    expect(matrix[0][1]).toBe(matrix[1][0]);
  });
});

describe('covarianceMatrix', () => {
  it('returns correct covariance for identical columns', () => {
    const cols = [[1, 2, 3], [1, 2, 3]];
    const cov = covarianceMatrix(cols);
    expect(cov[0][0]).toBeCloseTo(cov[0][1]);
    expect(cov[0][0]).toBeGreaterThan(0);
  });

  it('returns symmetric matrix', () => {
    const cols = [[1, 2, 3, 4], [4, 3, 2, 1], [1, 3, 2, 4]];
    const cov = covarianceMatrix(cols);
    expect(cov[0][1]).toBeCloseTo(cov[1][0]);
    expect(cov[0][2]).toBeCloseTo(cov[2][0]);
    expect(cov[1][2]).toBeCloseTo(cov[2][1]);
  });
});

describe('choleskyDecompose', () => {
  it('decomposes identity matrix', () => {
    const L = choleskyDecompose([[1, 0], [0, 1]]);
    expect(L).toEqual([[1, 0], [0, 1]]);
  });

  it('L * L^T reconstructs original matrix', () => {
    const A = [[4, 2], [2, 3]];
    const L = choleskyDecompose(A);

    // Reconstruct: A = L * L^T
    const reconstructed = [
      [L[0][0] * L[0][0] + L[0][1] * L[0][1], L[0][0] * L[1][0] + L[0][1] * L[1][1]],
      [L[1][0] * L[0][0] + L[1][1] * L[0][1], L[1][0] * L[1][0] + L[1][1] * L[1][1]],
    ];
    expect(reconstructed[0][0]).toBeCloseTo(A[0][0]);
    expect(reconstructed[0][1]).toBeCloseTo(A[0][1]);
    expect(reconstructed[1][0]).toBeCloseTo(A[1][0]);
    expect(reconstructed[1][1]).toBeCloseTo(A[1][1]);
  });

  it('L is lower triangular', () => {
    const L = choleskyDecompose([[4, 2], [2, 3]]);
    expect(L[0][1]).toBe(0);
  });
});

describe('normalRandom', () => {
  it('generates finite numbers', () => {
    for (let i = 0; i < 100; i++) {
      const val = normalRandom();
      expect(isFinite(val)).toBe(true);
    }
  });

  it('generates numbers roughly in standard normal range', () => {
    const samples = Array.from({ length: 10000 }, () => normalRandom());
    const m = mean(samples);
    const s = std(samples, 1);
    expect(m).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(1, 0);
  });
});

describe('normalRandomArray', () => {
  it('returns array of correct length', () => {
    expect(normalRandomArray(5).length).toBe(5);
    expect(normalRandomArray(0).length).toBe(0);
  });
});

describe('matVecMultiply', () => {
  it('multiplies identity matrix by vector', () => {
    const result = matVecMultiply([[1, 0], [0, 1]], [3, 7]);
    expect(result).toEqual([3, 7]);
  });

  it('multiplies general matrix', () => {
    const result = matVecMultiply([[1, 2], [3, 4]], [5, 6]);
    expect(result).toEqual([17, 39]);
  });
});

describe('ensurePSD', () => {
  it('adds small epsilon to diagonal', () => {
    const m = [[1, 0.5], [0.5, 1]];
    const psd = ensurePSD(m);
    expect(psd[0][0]).toBeCloseTo(1.000001);
    expect(psd[1][1]).toBeCloseTo(1.000001);
    expect(psd[0][1]).toBe(0.5); // off-diagonal unchanged
  });

  it('does not mutate original', () => {
    const m = [[1, 0], [0, 1]];
    ensurePSD(m);
    expect(m[0][0]).toBe(1);
  });
});

describe('round', () => {
  it('rounds to specified decimals', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(3.145, 2)).toBe(3.15);
    expect(round(3.14159, 0)).toBe(3);
    expect(round(3.14159, 4)).toBe(3.1416);
  });

  it('handles negative numbers', () => {
    expect(round(-2.567, 1)).toBe(-2.6);
  });
});

describe('clip', () => {
  it('clips value within range', () => {
    expect(clip(5, 0, 10)).toBe(5);
    expect(clip(-5, 0, 10)).toBe(0);
    expect(clip(15, 0, 10)).toBe(10);
  });

  it('handles edge values', () => {
    expect(clip(0, 0, 10)).toBe(0);
    expect(clip(10, 0, 10)).toBe(10);
  });
});

describe('safeFloat', () => {
  it('converts valid numbers', () => {
    expect(safeFloat(42)).toBe(42);
    expect(safeFloat('3.14')).toBe(3.14);
    expect(safeFloat(0)).toBe(0);
  });

  it('returns null for invalid inputs', () => {
    expect(safeFloat(null)).toBeNull();
    expect(safeFloat(undefined)).toBeNull();
    expect(safeFloat('abc')).toBeNull();
    expect(safeFloat(Infinity)).toBeNull();
    expect(safeFloat(NaN)).toBeNull();
  });
});
