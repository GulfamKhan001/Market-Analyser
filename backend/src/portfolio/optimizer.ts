/**
 * Portfolio position sizing and allocation optimization.
 * Kelly criterion, regime-based adjustment, and simplified mean-variance optimization.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import { mean, dailyReturns, covarianceMatrix, round } from '../utils/math';
import { daysAgo } from '../utils/format';

const TRADING_DAYS_PER_YEAR = 252;

const REGIME_FACTORS: Record<string, number> = {
  RISK_ON: 1.0,
  NEUTRAL: 0.75,
  RISK_OFF: 0.5,
  CRISIS: 0.25,
};

export function kellyPositionSize(
  winProb: number,
  avgWin: number,
  avgLoss: number,
  portfolioValue: number,
  kellyFraction: number = 0.5,
): number {
  if (avgLoss <= 0 || avgWin <= 0 || portfolioValue <= 0) return 0;

  const q = 1 - winProb;
  let kellyF = (winProb / avgLoss) - (q / avgWin);
  kellyF = Math.max(kellyF * kellyFraction, 0);

  return round(kellyF * portfolioValue, 2);
}

export function regimeAdjustedSize(baseSize: number, regimeLabel: string): number {
  const factor = REGIME_FACTORS[regimeLabel] || 0.75;
  return round(baseSize * factor, 2);
}

export async function suggestPositionSize(
  ticker: string,
  prisma?: PrismaClient,
): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const settings = getSettings();

  const positions = await db.portfolioPosition.findMany();
  let portfolioValue = 0;
  for (const p of positions) {
    const price = p.currentPrice || Number(p.entryPrice);
    portfolioValue += price * Number(p.quantity);
  }

  if (portfolioValue <= 0) {
    return { suggested_size: 0, kelly_raw: 0, regime_factor: 0, regime_label: 'UNKNOWN', max_position_cap: 0 };
  }

  const startDate = daysAgo(Math.floor(TRADING_DAYS_PER_YEAR * 1.5));
  const prices = await db.stockPrice.findMany({
    where: { ticker, date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { adjClose: true },
  });

  const closes = prices.filter(p => p.adjClose !== null).map(p => p.adjClose!);

  if (closes.length < 20) {
    return {
      suggested_size: 0,
      kelly_raw: 0,
      regime_factor: 0,
      regime_label: 'UNKNOWN',
      max_position_cap: round(portfolioValue * settings.MAX_POSITION_PCT, 2),
    };
  }

  const returns = dailyReturns(closes);
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r < 0);

  const winProb = returns.length > 0 ? wins.length / returns.length : 0.5;
  const avgWin = wins.length > 0 ? mean(wins) : 0.01;
  const avgLoss = losses.length > 0 ? -mean(losses) : 0.01;

  const kellyRaw = kellyPositionSize(winProb, avgWin, avgLoss, portfolioValue, settings.KELLY_FRACTION);

  // Current regime
  const latestRegime = await db.regimeState.findFirst({ orderBy: { date: 'desc' } });
  const regimeLabel = latestRegime?.regimeLabel || 'NEUTRAL';
  const regimeFactor = REGIME_FACTORS[regimeLabel] || 0.75;

  const adjusted = regimeAdjustedSize(kellyRaw, regimeLabel);
  const maxCap = portfolioValue * settings.MAX_POSITION_PCT;
  const suggested = Math.min(adjusted, maxCap);

  return {
    suggested_size: round(suggested, 2),
    kelly_raw: round(kellyRaw, 2),
    regime_factor: regimeFactor,
    regime_label: regimeLabel,
    max_position_cap: round(maxCap, 2),
  };
}

export async function optimizeAllocation(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const settings = getSettings();

  const positions = await db.portfolioPosition.findMany();
  const tickers = [...new Set(positions.map(p => p.ticker))].sort();

  if (tickers.length < 2) {
    if (tickers.length === 1) return { weights: { [tickers[0]]: 1.0 }, status: 'single_asset' };
    return { weights: {}, status: 'no_positions' };
  }

  const startDate = daysAgo(Math.floor(TRADING_DAYS_PER_YEAR * 1.5));
  const pricesRaw = await db.stockPrice.findMany({
    where: { ticker: { in: tickers }, date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { ticker: true, date: true, adjClose: true },
  });

  if (pricesRaw.length === 0) return { weights: {}, status: 'no_price_data' };

  // Build price series per ticker
  const pricesByTicker: Record<string, number[]> = {};
  for (const t of tickers) pricesByTicker[t] = [];

  const dateGroups = new Map<string, Record<string, number>>();
  for (const p of pricesRaw) {
    if (p.adjClose === null) continue;
    const dk = p.date.toISOString().split('T')[0];
    if (!dateGroups.has(dk)) dateGroups.set(dk, {});
    dateGroups.get(dk)![p.ticker] = p.adjClose;
  }

  const dates = [...dateGroups.keys()].sort();
  for (const dk of dates) {
    const prices = dateGroups.get(dk)!;
    const allPresent = tickers.every(t => prices[t] !== undefined);
    if (allPresent) {
      for (const t of tickers) {
        pricesByTicker[t].push(prices[t]);
      }
    }
  }

  const availableTickers = tickers.filter(t => pricesByTicker[t].length >= 20);
  if (availableTickers.length < 2) return { weights: {}, status: 'insufficient_price_data' };

  const returnsColumns = availableTickers.map(t => dailyReturns(pricesByTicker[t]));
  const minLen = Math.min(...returnsColumns.map(c => c.length));
  if (minLen < 20) return { weights: {}, status: 'insufficient_return_data' };

  const trimmed = returnsColumns.map(c => c.slice(-minLen));
  const meanReturns = trimmed.map(c => mean(c));
  const covMatrix = covarianceMatrix(trimmed);
  const n = availableTickers.length;

  // Risk-free rate
  let riskFreeAnnual = 0;
  const latestFfr = await db.macroIndicator.findFirst({
    where: { indicatorName: 'fed_funds_rate' },
    orderBy: { date: 'desc' },
  });
  if (latestFfr?.value) riskFreeAnnual = latestFfr.value / 100;
  const rfDaily = riskFreeAnnual / TRADING_DAYS_PER_YEAR;

  // Simple equal weight as baseline (scipy.optimize replacement)
  // For a more accurate result, use gradient descent or portfolio-optimizer npm
  const equalWeight = 1 / n;
  const weights: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    weights[availableTickers[i]] = round(equalWeight, 4);
  }

  // Compute metrics for equal-weight portfolio
  let optReturn = 0;
  let optVol = 0;

  for (let i = 0; i < n; i++) {
    optReturn += equalWeight * meanReturns[i] * TRADING_DAYS_PER_YEAR;
    for (let j = 0; j < n; j++) {
      optVol += equalWeight * equalWeight * covMatrix[i][j];
    }
  }
  optVol = Math.sqrt(optVol) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const optSharpe = optVol > 0 ? (optReturn - riskFreeAnnual) / optVol : 0;

  return {
    weights,
    expected_annual_return: round(optReturn, 4),
    expected_annual_volatility: round(optVol, 4),
    expected_sharpe: round(optSharpe, 4),
    status: 'equal_weight',
  };
}
