/**
 * Multi-timeframe confluence analysis.
 * Checks whether daily, weekly, and monthly technical signals agree on direction.
 */

import { PrismaClient, TechnicalSignal } from '@prisma/client';
import { getPrisma } from '../db/client';
import { mean as arrMean } from '../utils/math';

const TIMEFRAMES = ['daily', 'weekly', 'monthly'];
const DAILY_WEEKLY_BONUS = 20;
const MONTHLY_ALIGNMENT_BONUS = 10;

function classifySignal(ts: TechnicalSignal): string {
  let bullishVotes = 0;
  let bearishVotes = 0;

  const comp = ts.compositeScore;
  if (comp !== null) {
    if (comp >= 60) bullishVotes += 2;
    else if (comp <= 40) bearishVotes += 2;
  }

  const macdH = ts.macdHist;
  if (macdH !== null) {
    if (macdH > 0) bullishVotes += 1;
    else if (macdH < 0) bearishVotes += 1;
  }

  const rsi = ts.rsi;
  if (rsi !== null) {
    if (rsi > 55) bullishVotes += 1;
    else if (rsi < 45) bearishVotes += 1;
  }

  const trend = ts.trendScore;
  if (trend !== null) {
    if (trend >= 60) bullishVotes += 1;
    else if (trend <= 40) bearishVotes += 1;
  }

  if (bullishVotes >= bearishVotes + 2) return 'bullish';
  if (bearishVotes >= bullishVotes + 2) return 'bearish';
  return 'neutral';
}

export async function multiTimeframeConfluence(
  ticker: string,
  prisma?: PrismaClient,
): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const signals: Record<string, any> = {};

  for (const tf of TIMEFRAMES) {
    const ts = await db.technicalSignal.findFirst({
      where: { ticker, timeframe: tf },
      orderBy: { date: 'desc' },
    });

    if (ts) {
      signals[tf] = {
        classification: classifySignal(ts),
        composite_score: ts.compositeScore,
        date: ts.date.toISOString().split('T')[0],
      };
    } else {
      signals[tf] = {
        classification: 'unavailable',
        composite_score: null,
        date: null,
      };
    }
  }

  // Compute confluence
  const available: Record<string, any> = {};
  for (const [tf, info] of Object.entries(signals)) {
    if (info.classification !== 'unavailable') {
      available[tf] = info;
    }
  }

  if (Object.keys(available).length === 0) {
    return {
      ticker,
      confluence_score: 0,
      aligned_timeframes: [],
      signals,
      base_direction: 'unknown',
    };
  }

  // Majority vote for dominant direction
  const counts: Record<string, number> = { bullish: 0, bearish: 0, neutral: 0 };
  for (const info of Object.values(available)) {
    counts[info.classification] = (counts[info.classification] || 0) + 1;
  }

  const baseDirection = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const aligned = Object.entries(available)
    .filter(([, info]) => info.classification === baseDirection)
    .map(([tf]) => tf);

  let confluenceScore = 0;

  const dailyCls = signals.daily?.classification;
  const weeklyCls = signals.weekly?.classification;
  const monthlyCls = signals.monthly?.classification;

  if (
    dailyCls && dailyCls !== 'unavailable' &&
    weeklyCls && weeklyCls !== 'unavailable' &&
    dailyCls === weeklyCls && dailyCls !== 'neutral'
  ) {
    confluenceScore += DAILY_WEEKLY_BONUS;

    if (monthlyCls && monthlyCls !== 'unavailable' && monthlyCls === dailyCls) {
      confluenceScore += MONTHLY_ALIGNMENT_BONUS;
    }
  }

  // Baseline from composite scores
  const compScores = Object.entries(available)
    .filter(([tf]) => aligned.includes(tf))
    .map(([, info]) => info.composite_score)
    .filter((s: any): s is number => s !== null);

  if (compScores.length > 0) {
    confluenceScore += Math.floor(arrMean(compScores) * 0.5);
  }

  // Bonus for full alignment
  if (aligned.length === Object.keys(available).length && aligned.length >= 2 && baseDirection !== 'neutral') {
    confluenceScore += 10;
  }

  confluenceScore = Math.min(confluenceScore, 100);

  return {
    ticker,
    confluence_score: confluenceScore,
    aligned_timeframes: aligned,
    signals,
    base_direction: baseDirection,
  };
}
