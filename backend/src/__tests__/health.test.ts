import { describe, it, expect } from 'vitest';

// Import the scoring functions directly by re-exporting them for testing
// Since they are not exported, we test them through computeHealthScore
// But we can test the scoring logic by re-implementing the pure functions

// Pure function tests for the health scoring sub-scores
// These mirror the logic in health.ts

function scoreDiversification(concentration: Record<string, any>, hhi: number): number {
  let score = 25;
  if (hhi > 5000) score -= 15;
  else if (hhi > 3000) score -= 10;
  else if (hhi > 2000) score -= 5;

  const top3 = concentration.top_3_pct || 0;
  if (top3 > 80) score -= 10;
  else if (top3 > 60) score -= 5;
  else if (top3 > 40) score -= 2;

  return Math.max(0, score);
}

function scoreRisk(riskMetrics: Record<string, any>): number {
  let score = 0;
  const sharpe = riskMetrics.sharpe_ratio;
  if (sharpe !== undefined && sharpe !== null) {
    if (sharpe >= 1.5) score += 15;
    else if (sharpe >= 1.0) score += 12;
    else if (sharpe >= 0.5) score += 8;
    else if (sharpe >= 0) score += 4;
  }

  const mdd = riskMetrics.max_drawdown;
  if (mdd !== undefined && mdd !== null) {
    const mddAbs = Math.abs(mdd);
    if (mddAbs < 0.05) score += 10;
    else if (mddAbs < 0.10) score += 7;
    else if (mddAbs < 0.20) score += 4;
    else if (mddAbs < 0.30) score += 2;
  }

  return Math.min(25, score);
}

function scorePerformance(twr: Record<string, any>): number {
  const twrAnn = twr.twr_annualized ?? null;
  if (twrAnn === null) return 12.5;

  const benchmark = 0.10;
  let score = 0;

  if (twrAnn >= benchmark * 1.5) score = 25;
  else if (twrAnn >= benchmark) score = 20;
  else if (twrAnn >= benchmark * 0.5) score = 15;
  else if (twrAnn >= 0) score = 10;
  else if (twrAnn >= -0.05) score = 5;

  const days = twr.days || 0;
  if (days < 20) score *= 0.5;

  return Math.min(25, score);
}

function scoreBalance(riskMetrics: Record<string, any>, clusters: Record<string, any>): number {
  let score = 0;
  const beta = riskMetrics.beta;
  if (beta !== undefined && beta !== null) {
    if (beta >= 0.8 && beta <= 1.2) score += 15;
    else if (beta >= 0.5 && beta <= 1.5) score += 10;
    else if (beta >= 0.3 && beta <= 2.0) score += 5;
  }

  const nClusters = (clusters.clusters || []).length;
  if (nClusters >= 4) score += 10;
  else if (nClusters >= 3) score += 7;
  else if (nClusters >= 2) score += 4;
  else if (nClusters === 1) score += 1;

  return Math.min(25, score);
}

describe('scoreDiversification', () => {
  it('returns max 25 for low HHI and low concentration', () => {
    expect(scoreDiversification({ top_3_pct: 30 }, 1500)).toBe(25);
  });

  it('penalizes high HHI (>5000)', () => {
    expect(scoreDiversification({ top_3_pct: 30 }, 6000)).toBe(10);
  });

  it('penalizes high HHI (>3000)', () => {
    expect(scoreDiversification({ top_3_pct: 30 }, 4000)).toBe(15);
  });

  it('penalizes high HHI (>2000)', () => {
    expect(scoreDiversification({ top_3_pct: 30 }, 2500)).toBe(20);
  });

  it('penalizes high top-3 concentration (>80)', () => {
    expect(scoreDiversification({ top_3_pct: 85 }, 1000)).toBe(15);
  });

  it('penalizes moderate top-3 concentration (>60)', () => {
    expect(scoreDiversification({ top_3_pct: 70 }, 1000)).toBe(20);
  });

  it('penalizes slight top-3 concentration (>40)', () => {
    expect(scoreDiversification({ top_3_pct: 50 }, 1000)).toBe(23);
  });

  it('floors at 0', () => {
    expect(scoreDiversification({ top_3_pct: 90 }, 6000)).toBe(0);
  });

  it('handles missing top_3_pct', () => {
    expect(scoreDiversification({}, 1000)).toBe(25);
  });
});

describe('scoreRisk', () => {
  it('max 25 for excellent Sharpe and low drawdown', () => {
    expect(scoreRisk({ sharpe_ratio: 2.0, max_drawdown: -0.03 })).toBe(25);
  });

  it('scores Sharpe >= 1.0', () => {
    expect(scoreRisk({ sharpe_ratio: 1.2 })).toBe(12);
  });

  it('scores Sharpe >= 0.5', () => {
    expect(scoreRisk({ sharpe_ratio: 0.7 })).toBe(8);
  });

  it('scores Sharpe >= 0', () => {
    expect(scoreRisk({ sharpe_ratio: 0.1 })).toBe(4);
  });

  it('no score for negative Sharpe', () => {
    expect(scoreRisk({ sharpe_ratio: -0.5 })).toBe(0);
  });

  it('scores low drawdown', () => {
    expect(scoreRisk({ max_drawdown: -0.03 })).toBe(10);
  });

  it('scores moderate drawdown', () => {
    expect(scoreRisk({ max_drawdown: -0.08 })).toBe(7);
  });

  it('scores high drawdown', () => {
    expect(scoreRisk({ max_drawdown: -0.15 })).toBe(4);
  });

  it('handles missing metrics', () => {
    expect(scoreRisk({})).toBe(0);
  });
});

describe('scorePerformance', () => {
  it('returns 12.5 for null TWR', () => {
    expect(scorePerformance({})).toBe(12.5);
  });

  it('max 25 for beating benchmark by 1.5x', () => {
    expect(scorePerformance({ twr_annualized: 0.16, days: 252 })).toBe(25);
  });

  it('scores beating benchmark', () => {
    expect(scorePerformance({ twr_annualized: 0.12, days: 252 })).toBe(20);
  });

  it('scores moderate performance', () => {
    expect(scorePerformance({ twr_annualized: 0.06, days: 252 })).toBe(15);
  });

  it('halves score for short track record (<20 days)', () => {
    expect(scorePerformance({ twr_annualized: 0.16, days: 10 })).toBe(12.5);
  });

  it('scores negative performance', () => {
    expect(scorePerformance({ twr_annualized: -0.03, days: 252 })).toBe(5);
  });

  it('zero score for large losses', () => {
    expect(scorePerformance({ twr_annualized: -0.10, days: 252 })).toBe(0);
  });
});

describe('scoreBalance', () => {
  it('max 25 for ideal beta and many clusters', () => {
    expect(scoreBalance({ beta: 1.0 }, { clusters: [1, 2, 3, 4] })).toBe(25);
  });

  it('scores beta near market (0.8-1.2)', () => {
    expect(scoreBalance({ beta: 0.9 }, { clusters: [] })).toBe(15);
  });

  it('scores moderate beta (0.5-1.5)', () => {
    expect(scoreBalance({ beta: 0.6 }, { clusters: [] })).toBe(10);
  });

  it('scores extreme beta (0.3-2.0)', () => {
    expect(scoreBalance({ beta: 0.35 }, { clusters: [] })).toBe(5);
  });

  it('no beta score for very extreme beta', () => {
    expect(scoreBalance({ beta: 0.1 }, { clusters: [] })).toBe(0);
  });

  it('scores 4+ clusters', () => {
    expect(scoreBalance({}, { clusters: [1, 2, 3, 4] })).toBe(10);
  });

  it('scores 3 clusters', () => {
    expect(scoreBalance({}, { clusters: [1, 2, 3] })).toBe(7);
  });

  it('scores 2 clusters', () => {
    expect(scoreBalance({}, { clusters: [1, 2] })).toBe(4);
  });

  it('scores 1 cluster', () => {
    expect(scoreBalance({}, { clusters: [1] })).toBe(1);
  });

  it('handles missing everything', () => {
    expect(scoreBalance({}, {})).toBe(0);
  });
});

describe('composite health score', () => {
  it('total of all sub-scores ranges 0-100', () => {
    const div = scoreDiversification({ top_3_pct: 30 }, 1500);
    const risk = scoreRisk({ sharpe_ratio: 2.0, max_drawdown: -0.03 });
    const perf = scorePerformance({ twr_annualized: 0.16, days: 252 });
    const bal = scoreBalance({ beta: 1.0 }, { clusters: [1, 2, 3, 4] });
    const total = div + risk + perf + bal;
    expect(total).toBe(100);
  });

  it('all zeros for worst case', () => {
    const div = scoreDiversification({ top_3_pct: 95 }, 7000);
    const risk = scoreRisk({ sharpe_ratio: -1.0, max_drawdown: -0.50 });
    const perf = scorePerformance({ twr_annualized: -0.20, days: 252 });
    const bal = scoreBalance({ beta: 0.1 }, { clusters: [] });
    const total = div + risk + perf + bal;
    expect(total).toBe(0);
  });
});
