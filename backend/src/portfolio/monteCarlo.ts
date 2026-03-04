/**
 * Monte Carlo simulation using Geometric Brownian Motion with
 * Cholesky-correlated returns.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import {
  mean, std, dailyReturns, correlation, choleskyDecompose,
  normalRandomArray, ensurePSD, round, percentile,
} from '../utils/math';
import { daysAgo } from '../utils/format';

const TRADING_DAYS_PER_YEAR = 252;

function emptyResult(horizonDays: number) {
  return {
    current_value: 0,
    horizon_days: horizonDays,
    num_paths: 0,
    percentiles: { p5: [], p25: [], p50: [], p75: [], p95: [] },
    terminal_distribution: {
      mean: 0, median: 0, std: 0, prob_loss: 0,
      worst_case_5pct: 0, best_case_95pct: 0, mean_return_pct: 0,
    },
  };
}

export async function runMonteCarlo(
  prisma?: PrismaClient,
  numPaths: number = 1000,
  horizonDays: number = 252,
): Promise<Record<string, any>> {
  const db = prisma || getPrisma();

  const positions = await db.portfolioPosition.findMany();
  if (positions.length === 0) return emptyResult(horizonDays);

  // Aggregate by ticker
  const tickerQty: Record<string, number> = {};
  const tickerPrice: Record<string, number> = {};
  for (const p of positions) {
    const t = p.ticker;
    tickerQty[t] = (tickerQty[t] || 0) + Number(p.quantity);
    if (!tickerPrice[t]) tickerPrice[t] = p.currentPrice || Number(p.entryPrice);
  }

  const tickers = Object.keys(tickerQty);
  if (tickers.length === 0) return emptyResult(horizonDays);

  // Fetch historical prices
  const startDate = daysAgo(Math.floor(TRADING_DAYS_PER_YEAR * 1.5));
  const pricesRaw = await db.stockPrice.findMany({
    where: { ticker: { in: tickers }, date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { ticker: true, adjClose: true },
  });

  // Build returns per ticker
  const pricesByTicker: Record<string, number[]> = {};
  for (const t of tickers) pricesByTicker[t] = [];
  for (const p of pricesRaw) {
    if (p.adjClose !== null) pricesByTicker[p.ticker]?.push(p.adjClose);
  }

  const available = tickers.filter(t => pricesByTicker[t].length >= 20);
  if (available.length === 0) return emptyResult(horizonDays);

  const returnsPerTicker = available.map(t => dailyReturns(pricesByTicker[t]));
  const nAssets = available.length;

  // Annualized mu and sigma
  const mu = returnsPerTicker.map(r => mean(r) * TRADING_DAYS_PER_YEAR);
  const sigma = returnsPerTicker.map(r => std(r, 1) * Math.sqrt(TRADING_DAYS_PER_YEAR));

  // Correlation matrix
  const corrMatrix: number[][] = Array.from({ length: nAssets }, () => Array(nAssets).fill(0));
  for (let i = 0; i < nAssets; i++) {
    corrMatrix[i][i] = 1;
    for (let j = i + 1; j < nAssets; j++) {
      const c = correlation(returnsPerTicker[i], returnsPerTicker[j]);
      corrMatrix[i][j] = c;
      corrMatrix[j][i] = c;
    }
  }

  const L = choleskyDecompose(ensurePSD(corrMatrix));

  // Current portfolio value and weights
  const currentValues = available.map(t => tickerQty[t] * tickerPrice[t]);
  const totalValue = currentValues.reduce((a, b) => a + b, 0);
  if (totalValue <= 0) return emptyResult(horizonDays);

  const weights = currentValues.map(v => v / totalValue);

  // Daily drift and vol
  const dt = 1 / TRADING_DAYS_PER_YEAR;
  const dailyDrift = mu.map((m, i) => (m - 0.5 * sigma[i] ** 2) * dt);
  const dailyVol = sigma.map(s => s * Math.sqrt(dt));

  // Simulate paths
  const paths: number[][] = [];
  for (let p = 0; p < numPaths; p++) {
    const path = [totalValue];
    for (let step = 0; step < horizonDays; step++) {
      const Z = normalRandomArray(nAssets);
      // Correlate: Z_corr = L * Z
      const corrZ = L.map(row => row.reduce((sum, val, j) => sum + val * Z[j], 0));

      let portReturn = 0;
      for (let i = 0; i < nAssets; i++) {
        const logRet = dailyDrift[i] + dailyVol[i] * corrZ[i];
        portReturn += weights[i] * Math.exp(logRet);
      }

      path.push(path[path.length - 1] * portReturn);
    }
    paths.push(path);
  }

  // Percentile paths
  const percentilesResult: Record<string, number[]> = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  for (let step = 0; step <= horizonDays; step++) {
    const stepValues = paths.map(p => p[step]);
    percentilesResult.p5.push(round(percentile(stepValues, 5), 2));
    percentilesResult.p25.push(round(percentile(stepValues, 25), 2));
    percentilesResult.p50.push(round(percentile(stepValues, 50), 2));
    percentilesResult.p75.push(round(percentile(stepValues, 75), 2));
    percentilesResult.p95.push(round(percentile(stepValues, 95), 2));
  }

  // Terminal distribution
  const terminal = paths.map(p => p[p.length - 1]);
  const terminalReturns = terminal.map(t => (t / totalValue) - 1);
  const lossCount = terminal.filter(t => t < totalValue).length;

  return {
    current_value: round(totalValue, 2),
    horizon_days: horizonDays,
    num_paths: numPaths,
    percentiles: percentilesResult,
    terminal_distribution: {
      mean: round(mean(terminal), 2),
      median: round(percentile(terminal, 50), 2),
      std: round(std(terminal, 1), 2),
      prob_loss: round(lossCount / numPaths, 4),
      worst_case_5pct: round(percentile(terminal, 5), 2),
      best_case_95pct: round(percentile(terminal, 95), 2),
      mean_return_pct: round(mean(terminalReturns) * 100, 2),
    },
  };
}
