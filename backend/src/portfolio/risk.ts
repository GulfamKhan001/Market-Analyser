/**
 * Portfolio risk analytics — VaR, CVaR, drawdown, Sharpe, Sortino, beta,
 * correlation matrix, concentration, clustering, and stress testing.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import {
  mean, std, percentile, quantile, dailyReturns, correlation,
  correlationMatrix as buildCorrelationMatrix, round,
} from '../utils/math';
import { daysAgo } from '../utils/format';
import { fetchPrices } from '../ingestion/yahoo';

const TRADING_DAYS_PER_YEAR = 252;

async function getPortfolioReturns(db: PrismaClient, days: number = 252): Promise<{ dates: Date[]; returns: number[] }> {
  const positions = await db.portfolioPosition.findMany();
  if (positions.length === 0) return { dates: [], returns: [] };

  const startDate = daysAgo(Math.floor(days * 1.5));
  const tickerQty: Record<string, number> = {};
  const tickerEntryPrice: Record<string, number> = {};

  for (const p of positions) {
    const t = p.ticker;
    tickerQty[t] = (tickerQty[t] || 0) + Number(p.quantity);
    if (!tickerEntryPrice[t]) tickerEntryPrice[t] = Number(p.entryPrice);
  }

  const tickers = Object.keys(tickerQty);

  const pricesRaw = await db.stockPrice.findMany({
    where: { ticker: { in: tickers }, date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { ticker: true, date: true, adjClose: true },
  });

  if (pricesRaw.length === 0) return { dates: [], returns: [] };

  // Build price matrix: date -> ticker -> price
  const dateMap = new Map<string, Record<string, number>>();
  const allDates: string[] = [];

  for (const p of pricesRaw) {
    const dateKey = p.date.toISOString().split('T')[0];
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, {});
      allDates.push(dateKey);
    }
    if (p.adjClose !== null) {
      dateMap.get(dateKey)![p.ticker] = p.adjClose;
    }
  }

  allDates.sort();

  // Forward fill and compute returns
  const prev: Record<string, number> = {};
  const dateReturns: { date: string; ret: number }[] = [];

  for (let i = 0; i < allDates.length; i++) {
    const dateKey = allDates[i];
    const prices = dateMap.get(dateKey)!;

    // Forward fill
    for (const t of tickers) {
      if (prices[t] !== undefined) prev[t] = prices[t];
      else if (prev[t] !== undefined) prices[t] = prev[t];
    }

    if (i === 0) continue;

    const prevDateKey = allDates[i - 1];
    const prevPrices = dateMap.get(prevDateKey)!;

    // Compute total values
    let totalValueNow = 0;
    let totalValuePrev = 0;
    for (const t of tickers) {
      if (prices[t] !== undefined && prevPrices[t] !== undefined) {
        totalValueNow += tickerQty[t] * prices[t];
        totalValuePrev += tickerQty[t] * prevPrices[t];
      }
    }

    if (totalValuePrev > 0) {
      dateReturns.push({ date: dateKey, ret: (totalValueNow - totalValuePrev) / totalValuePrev });
    }
  }

  const trimmed = dateReturns.slice(-days);
  return {
    dates: trimmed.map(d => new Date(d.date)),
    returns: trimmed.map(d => d.ret),
  };
}

function computeVar(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  const cutoff = quantile(returns, 1 - confidence);
  return -cutoff;
}

export async function computeRiskMetrics(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const { returns } = await getPortfolioReturns(db, TRADING_DAYS_PER_YEAR);
  const result: Record<string, any> = {};

  if (returns.length < 5) return result;

  // VaR
  result.var_95 = round(computeVar(returns, 0.95), 6);
  result.var_99 = round(computeVar(returns, 0.99), 6);

  // CVaR
  const cutoff95 = quantile(returns, 0.05);
  const tail95 = returns.filter(r => r <= cutoff95);
  result.cvar_95 = tail95.length > 0 ? round(-mean(tail95), 6) : result.var_95;

  const cutoff99 = quantile(returns, 0.01);
  const tail99 = returns.filter(r => r <= cutoff99);
  result.cvar_99 = tail99.length > 0 ? round(-mean(tail99), 6) : result.var_99;

  // Max drawdown
  let peak = 1;
  let maxDd = 0;
  let cum = 1;
  for (const r of returns) {
    cum *= (1 + r);
    if (cum > peak) peak = cum;
    const dd = (cum - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  result.max_drawdown = round(maxDd, 6);

  // Risk-free rate
  let riskFreeAnnual = 0;
  const latestFfr = await db.macroIndicator.findFirst({
    where: { indicatorName: 'fed_funds_rate' },
    orderBy: { date: 'desc' },
  });
  if (latestFfr?.value !== undefined) {
    riskFreeAnnual = latestFfr.value / 100;
  }
  const riskFreeDaily = riskFreeAnnual / TRADING_DAYS_PER_YEAR;

  // Sharpe ratio
  const excess = returns.map(r => r - riskFreeDaily);
  const retStd = std(returns, 1);
  if (retStd !== 0) {
    result.sharpe_ratio = round((mean(excess) / retStd) * Math.sqrt(TRADING_DAYS_PER_YEAR), 4);
  } else {
    result.sharpe_ratio = 0;
  }

  // Sortino ratio
  const downside = returns.filter(r => r < riskFreeDaily).map(r => r - riskFreeDaily);
  const downsideStd = downside.length > 0 ? Math.sqrt(mean(downside.map(d => d * d))) : 0;
  if (downsideStd !== 0) {
    result.sortino_ratio = round((mean(excess) / downsideStd) * Math.sqrt(TRADING_DAYS_PER_YEAR), 4);
  } else {
    result.sortino_ratio = 0;
  }

  // Beta
  result.beta = await computeBeta(db, returns);

  // Correlation matrix
  result.correlation_matrix = await buildCorrMatrix(db);

  // Sector HHI
  result.sector_concentration_hhi = await sectorHhi(db);

  return result;
}

async function computeBeta(db: PrismaClient, portfolioReturns: number[]): Promise<number | null> {
  if (portfolioReturns.length === 0) return null;

  const startDate = daysAgo(Math.floor(TRADING_DAYS_PER_YEAR * 1.5));
  let benchPrices = await db.stockPrice.findMany({
    where: { ticker: 'SPY', date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { date: true, adjClose: true },
  });

  // Auto-backfill SPY if insufficient data for beta calculation
  if (benchPrices.length < 10) {
    try {
      await fetchPrices('SPY', '2y', db);
      benchPrices = await db.stockPrice.findMany({
        where: { ticker: 'SPY', date: { gte: startDate } },
        orderBy: { date: 'asc' },
        select: { date: true, adjClose: true },
      });
    } catch {
      // Fetch failed — SPY data unavailable
    }
  }

  if (benchPrices.length < 10) return null;

  const benchCloses = benchPrices.filter(p => p.adjClose !== null).map(p => p.adjClose!);
  const benchReturns = dailyReturns(benchCloses);

  const minLen = Math.min(portfolioReturns.length, benchReturns.length);
  if (minLen < 10) return null;

  const pr = portfolioReturns.slice(-minLen);
  const br = benchReturns.slice(-minLen);

  const prMean = mean(pr);
  const brMean = mean(br);
  let cov = 0, brVar = 0;
  for (let i = 0; i < minLen; i++) {
    cov += (pr[i] - prMean) * (br[i] - brMean);
    brVar += (br[i] - brMean) ** 2;
  }

  if (brVar === 0) return null;
  return round(cov / brVar, 4);
}

async function buildCorrMatrix(db: PrismaClient): Promise<Record<string, Record<string, number>>> {
  const positions = await db.portfolioPosition.findMany();
  const tickers = [...new Set(positions.map(p => p.ticker))];

  if (tickers.length < 2) return {};

  const startDate = daysAgo(Math.floor(TRADING_DAYS_PER_YEAR * 1.5));
  const pricesRaw = await db.stockPrice.findMany({
    where: { ticker: { in: tickers }, date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { ticker: true, date: true, adjClose: true },
  });

  // Build price series per ticker
  const pricesByTicker: Record<string, number[]> = {};
  for (const t of tickers) pricesByTicker[t] = [];

  const dateMap = new Map<string, Record<string, number>>();
  for (const p of pricesRaw) {
    if (p.adjClose === null) continue;
    const dk = p.date.toISOString().split('T')[0];
    if (!dateMap.has(dk)) dateMap.set(dk, {});
    dateMap.get(dk)![p.ticker] = p.adjClose;
  }

  const dates = [...dateMap.keys()].sort();
  for (const dk of dates) {
    const prices = dateMap.get(dk)!;
    for (const t of tickers) {
      if (prices[t] !== undefined) pricesByTicker[t].push(prices[t]);
    }
  }

  // Compute returns
  const returnsByTicker: Record<string, number[]> = {};
  for (const t of tickers) {
    returnsByTicker[t] = dailyReturns(pricesByTicker[t]);
  }

  const { matrix } = buildCorrelationMatrix(returnsByTicker);

  const result: Record<string, Record<string, number>> = {};
  for (let i = 0; i < tickers.length; i++) {
    result[tickers[i]] = {};
    for (let j = 0; j < tickers.length; j++) {
      result[tickers[i]][tickers[j]] = round(matrix[i][j], 4);
    }
  }

  return result;
}

async function sectorHhi(db: PrismaClient): Promise<number> {
  const positions = await db.portfolioPosition.findMany();
  if (positions.length === 0) return 0;

  const sectorValues: Record<string, number> = {};
  let total = 0;

  for (const p of positions) {
    const price = p.currentPrice || Number(p.entryPrice);
    const mv = price * Number(p.quantity);
    const sector = p.sector || 'Unknown';
    sectorValues[sector] = (sectorValues[sector] || 0) + mv;
    total += mv;
  }

  if (total === 0) return 0;
  return round(
    Object.values(sectorValues).reduce((sum, v) => sum + ((v / total) * 100) ** 2, 0),
    2,
  );
}

export async function computeConcentration(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const positions = await db.portfolioPosition.findMany();

  if (positions.length === 0) {
    return { top_3_pct: 0, top_5_pct: 0, largest_position: null, hhi: 0, position_weights: [] };
  }

  const holdings: { ticker: string; market_value: number; weight_pct: number }[] = [];
  let total = 0;

  for (const p of positions) {
    const price = p.currentPrice || Number(p.entryPrice);
    const mv = price * Number(p.quantity);
    holdings.push({ ticker: p.ticker, market_value: mv, weight_pct: 0 });
    total += mv;
  }

  if (total === 0) {
    return { top_3_pct: 0, top_5_pct: 0, largest_position: null, hhi: 0, position_weights: [] };
  }

  holdings.forEach(h => { h.weight_pct = round((h.market_value / total) * 100, 2); });
  holdings.sort((a, b) => b.market_value - a.market_value);

  const top3 = holdings.slice(0, 3).reduce((s, h) => s + h.weight_pct, 0);
  const top5 = holdings.slice(0, 5).reduce((s, h) => s + h.weight_pct, 0);
  const hhi = holdings.reduce((s, h) => s + h.weight_pct ** 2, 0);

  return {
    top_3_pct: round(top3, 2),
    top_5_pct: round(top5, 2),
    largest_position: holdings[0] ? { ticker: holdings[0].ticker, weight_pct: holdings[0].weight_pct } : null,
    hhi: round(hhi, 2),
    position_weights: holdings.map(h => ({ ticker: h.ticker, weight_pct: h.weight_pct })),
  };
}

export async function correlationClusters(
  prisma?: PrismaClient,
  threshold: number = 0.7,
): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const corrDict = await buildCorrMatrix(db);

  if (Object.keys(corrDict).length === 0) {
    return { clusters: [], high_correlation_pairs: [] };
  }

  const tickers = Object.keys(corrDict);
  const n = tickers.length;

  if (n < 2) {
    return { clusters: [{ cluster_id: 1, tickers }], high_correlation_pairs: [] };
  }

  // Simple single-linkage clustering
  const clusters = tickers.map((t, i) => [i]);
  const findCluster = (idx: number) => clusters.findIndex(c => c.includes(idx));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const corr = Math.abs(corrDict[tickers[i]]?.[tickers[j]] || 0);
      if (corr >= threshold) {
        const ci = findCluster(i);
        const cj = findCluster(j);
        if (ci !== cj && ci !== -1 && cj !== -1) {
          clusters[ci].push(...clusters[cj]);
          clusters.splice(cj, 1);
        }
      }
    }
  }

  const resultClusters = clusters
    .filter(c => c.length > 0)
    .map((c, idx) => ({
      cluster_id: idx + 1,
      tickers: c.map(i => tickers[i]),
    }));

  // High-correlation pairs
  const highPairs: any[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const corr = corrDict[tickers[i]]?.[tickers[j]] || 0;
      if (Math.abs(corr) >= threshold) {
        highPairs.push({
          ticker_1: tickers[i],
          ticker_2: tickers[j],
          correlation: round(corr, 4),
        });
      }
    }
  }

  return { clusters: resultClusters, high_correlation_pairs: highPairs };
}

export async function stressTestScenarios(
  prisma?: PrismaClient,
  drops?: number[],
): Promise<any[]> {
  const db = prisma || getPrisma();
  if (!drops) drops = [-10, -20, -30];

  const positions = await db.portfolioPosition.findMany();
  if (positions.length === 0) return [];

  const { returns } = await getPortfolioReturns(db, TRADING_DAYS_PER_YEAR);
  let portfolioBeta = await computeBeta(db, returns);
  if (portfolioBeta === null) portfolioBeta = 1.0;

  let totalValue = 0;
  const posData: { ticker: string; market_value: number }[] = [];

  for (const p of positions) {
    const price = p.currentPrice || Number(p.entryPrice);
    const mv = price * Number(p.quantity);
    totalValue += mv;
    posData.push({ ticker: p.ticker, market_value: mv });
  }

  return drops.map(dropPct => {
    const dropFrac = dropPct / 100;
    const portfolioImpactPct = portfolioBeta! * dropFrac;
    const portfolioImpactUsd = totalValue * portfolioImpactPct;

    const worstHit = posData
      .map(pd => ({ ticker: pd.ticker, impact_usd: round(pd.market_value * portfolioImpactPct, 2) }))
      .sort((a, b) => a.impact_usd - b.impact_usd)
      .slice(0, 3);

    return {
      label: `S&P 500 ${dropPct > 0 ? '+' : ''}${dropPct}%`,
      spy_drop_pct: dropPct,
      portfolio_impact_pct: round(portfolioImpactPct * 100, 2),
      portfolio_impact_usd: round(portfolioImpactUsd, 2),
      worst_hit_positions: worstHit,
    };
  });
}
