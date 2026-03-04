/**
 * Multi-factor stock screener.
 * Combines technical and fundamental scores with optional filters.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { daysAgo } from '../utils/format';
import { mean as arrMean } from '../utils/math';

interface ScreenerFilters {
  min_composite_score?: number;
  min_fundamental_score?: number;
  sector?: string | null;
  min_volume?: number | null;
  regime_filter?: string | null;
  timeframe?: string;
  limit?: number;
}

const DEFAULT_FILTERS: Required<ScreenerFilters> = {
  min_composite_score: 0,
  min_fundamental_score: 0,
  sector: null,
  min_volume: 0,
  regime_filter: null,
  timeframe: 'daily',
  limit: 50,
};

function quickFundamentalScore(f: any): number {
  const scores: number[] = [];

  // Value (PE based)
  const pe = f.peRatio;
  if (pe !== null && pe !== undefined && !isNaN(pe) && pe > 0) {
    if (pe < 15) scores.push(80);
    else if (pe < 25) scores.push(55);
    else scores.push(30);
  } else scores.push(50);

  // Quality (ROE based)
  const roe = f.roe;
  if (roe !== null && roe !== undefined && !isNaN(roe)) {
    if (roe > 15) scores.push(80);
    else if (roe > 5) scores.push(55);
    else scores.push(30);
  } else scores.push(50);

  // Growth (revenue growth)
  const rg = f.revenueGrowth;
  if (rg !== null && rg !== undefined && !isNaN(rg)) {
    const pct = Math.abs(rg) < 5 ? rg * 100 : rg;
    if (pct > 15) scores.push(80);
    else if (pct > 0) scores.push(55);
    else scores.push(30);
  } else scores.push(50);

  // Dividend
  const dy = f.dividendYield;
  if (dy !== null && dy !== undefined && !isNaN(dy)) {
    const pct = dy < 1 ? dy * 100 : dy;
    if (pct > 2) scores.push(70);
    else scores.push(45);
  } else scores.push(50);

  return arrMean(scores);
}

export async function screenStocks(
  prisma?: PrismaClient,
  filters?: ScreenerFilters,
): Promise<any[]> {
  const db = prisma || getPrisma();
  const cfg = { ...DEFAULT_FILTERS, ...filters };

  // Regime gate
  if (cfg.regime_filter) {
    const latestRegime = await db.regimeState.findFirst({
      orderBy: { date: 'desc' },
    });
    if (latestRegime && latestRegime.regimeLabel !== cfg.regime_filter) {
      return [];
    }
  }

  // Get latest technical signals per ticker
  const techSignals = await db.technicalSignal.findMany({
    where: { timeframe: cfg.timeframe },
    orderBy: { date: 'desc' },
  });

  // Deduplicate: keep only latest per ticker
  const techMap = new Map<string, typeof techSignals[0]>();
  for (const ts of techSignals) {
    if (!techMap.has(ts.ticker)) {
      techMap.set(ts.ticker, ts);
    }
  }

  if (techMap.size === 0) return [];

  // Get latest fundamentals per ticker
  const fundRows = await db.fundamental.findMany({
    orderBy: { dateFetched: 'desc' },
  });
  const fundMap = new Map<string, typeof fundRows[0]>();
  for (const f of fundRows) {
    if (!fundMap.has(f.ticker)) {
      fundMap.set(f.ticker, f);
    }
  }

  // Average volume per ticker (last 40 days)
  const volCutoff = daysAgo(40);
  const volData = await db.stockPrice.groupBy({
    by: ['ticker'],
    _avg: { volume: true },
    where: { date: { gte: volCutoff } },
  });
  const volMap = new Map(volData.map(v => [v.ticker, v._avg.volume || 0]));

  // Build results
  const results: any[] = [];

  for (const [ticker, ts] of techMap) {
    const composite = ts.compositeScore || 0;
    if (composite < cfg.min_composite_score) continue;

    const fund = fundMap.get(ticker);
    const sector = fund?.sector || null;

    if (cfg.sector && (!sector || sector.toLowerCase() !== cfg.sector.toLowerCase())) continue;

    const fundScore = fund ? quickFundamentalScore(fund) : null;
    if (cfg.min_fundamental_score && (fundScore === null || fundScore < cfg.min_fundamental_score)) continue;

    const avgVol = volMap.get(ticker) || 0;
    if (cfg.min_volume && avgVol < cfg.min_volume) continue;

    let combined = composite;
    if (fundScore !== null) combined = composite * 0.5 + fundScore * 0.5;

    results.push({
      ticker,
      composite_score: Math.round(composite * 100) / 100,
      trend_score: ts.trendScore !== null ? Math.round(ts.trendScore * 100) / 100 : null,
      momentum_score: ts.momentumScore !== null ? Math.round(ts.momentumScore * 100) / 100 : null,
      volatility_score: ts.volatilityScore !== null ? Math.round(ts.volatilityScore * 100) / 100 : null,
      volume_score: ts.volumeScore !== null ? Math.round(ts.volumeScore * 100) / 100 : null,
      fundamental_score: fundScore !== null ? Math.round(fundScore * 100) / 100 : null,
      combined_score: Math.round(combined * 100) / 100,
      sector,
      avg_volume: avgVol ? Math.round(avgVol) : null,
      signal_date: ts.date.toISOString().split('T')[0],
    });
  }

  results.sort((a, b) => b.combined_score - a.combined_score);
  return results.slice(0, cfg.limit);
}
