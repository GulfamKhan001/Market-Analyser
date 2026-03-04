/**
 * Statistical and mathematical utility functions.
 * Replaces numpy/pandas/scipy operations used across the Python backend.
 */

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function std(arr: number[], ddof: number = 0): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - ddof);
  return Math.sqrt(variance);
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function quantile(arr: number[], q: number): number {
  return percentile(arr, q * 100);
}

export function cumulative(arr: number[]): number[] {
  const result: number[] = [];
  let product = 1;
  for (const r of arr) {
    product *= 1 + r;
    result.push(product);
  }
  return result;
}

export function cumulativeMax(arr: number[]): number[] {
  const result: number[] = [];
  let max = -Infinity;
  for (const v of arr) {
    max = Math.max(max, v);
    result.push(max);
  }
  return result;
}

export function dailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] === 0) {
      returns.push(0);
    } else {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

export function rollingMean(arr: number[], window: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      const slice = arr.slice(i - window + 1, i + 1);
      result.push(mean(slice));
    }
  }
  return result;
}

/**
 * Correlation between two arrays.
 */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

/**
 * Build an NxN correlation matrix from columns of returns.
 * Returns { tickers, matrix } where matrix[i][j] is the correlation.
 */
export function correlationMatrix(
  returnsByTicker: Record<string, number[]>,
  commonLength?: number,
): { tickers: string[]; matrix: number[][] } {
  const tickers = Object.keys(returnsByTicker);
  const n = tickers.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const c = correlation(returnsByTicker[tickers[i]], returnsByTicker[tickers[j]]);
      matrix[i][j] = c;
      matrix[j][i] = c;
    }
  }

  return { tickers, matrix };
}

/**
 * Covariance matrix from columns of returns.
 */
export function covarianceMatrix(columns: number[][]): number[][] {
  const n = columns.length;
  const len = Math.min(...columns.map(c => c.length));
  const means = columns.map(c => mean(c.slice(0, len)));
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let cov = 0;
      for (let k = 0; k < len; k++) {
        cov += (columns[i][k] - means[i]) * (columns[j][k] - means[j]);
      }
      cov /= len > 1 ? len - 1 : 1;
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }

  return matrix;
}

/**
 * Cholesky decomposition of a positive-definite matrix.
 * Returns lower triangular matrix L such that A = L * L^T.
 */
export function choleskyDecompose(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }

      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = val > 0 ? Math.sqrt(val) : 0;
      } else {
        L[i][j] = L[j][j] !== 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }

  return L;
}

/**
 * Generate standard normal random number using Box-Muller transform.
 */
export function normalRandom(): number {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Generate array of standard normal random numbers.
 */
export function normalRandomArray(n: number): number[] {
  return Array.from({ length: n }, () => normalRandom());
}

/**
 * Multiply a vector by a matrix (vector @ matrix^T for correlated noise).
 */
export function matVecMultiply(matrix: number[][], vec: number[]): number[] {
  return matrix.map(row => row.reduce((sum, val, j) => sum + val * vec[j], 0));
}

/**
 * Ensure a correlation matrix is positive semi-definite by adding small diagonal.
 */
export function ensurePSD(matrix: number[][]): number[][] {
  const n = matrix.length;
  const result = matrix.map(row => [...row]);
  // Simple approach: add small epsilon to diagonal
  for (let i = 0; i < n; i++) {
    result[i][i] += 1e-6;
  }
  return result;
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function safeFloat(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? null : n;
}
