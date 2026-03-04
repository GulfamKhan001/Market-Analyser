/**
 * Market regime detection engine.
 * Rule-based replacement for HMM: combines SMA cross, VIX bands, and macro signals.
 * Same output shape as the Python HMM version.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { mean, dailyReturns } from '../utils/math';
import { daysAgo, startOfDay, toDateString } from '../utils/format';

const VIX_LOW = 15;
const VIX_NORMAL = 25;
const VIX_HIGH = 35;

const VOTE_WEIGHTS = { trend: 0.40, vix: 0.35, macro: 0.25 };

/**
 * Rule-based trend regime from S&P 500 SMA cross.
 * Replaces HMM: uses SMA(50) vs SMA(200) cross on SPY.
 */
async function trendRegime(db: PrismaClient): Promise<{ label: string; confidence: number; state: number | null } | null> {
  const cutoff = daysAgo(500);

  const spRows = await db.stockPrice.findMany({
    where: {
      ticker: { in: ['^GSPC', 'SPY'] },
      date: { gte: cutoff },
    },
    orderBy: { date: 'asc' },
    select: { close: true, date: true },
  });

  if (spRows.length < 200) {
    return null;
  }

  const closes = spRows.map(r => r.close || 0);

  // Compute SMA50 and SMA200 at the end
  const sma50 = mean(closes.slice(-50));
  const sma200 = mean(closes.slice(-200));

  // Recent momentum: 20-day return
  const recent = closes.slice(-21);
  const recentReturn = recent.length >= 2 ? (recent[recent.length - 1] - recent[0]) / recent[0] : 0;

  let label: string;
  let state: number;
  let confidence: number;

  if (sma50 > sma200) {
    if (recentReturn > 0.02) {
      label = 'Bull';
      state = 2;
      confidence = 0.85;
    } else {
      label = 'Bull';
      state = 2;
      confidence = 0.65;
    }
  } else if (sma50 < sma200) {
    if (recentReturn < -0.02) {
      label = 'Bear';
      state = 0;
      confidence = 0.85;
    } else {
      label = 'Bear';
      state = 0;
      confidence = 0.60;
    }
  } else {
    label = 'Sideways';
    state = 1;
    confidence = 0.50;
  }

  return { label, confidence, state };
}

async function vixRegime(db: PrismaClient): Promise<{ vix_level: number | null; label: string; confidence: number }> {
  const latestVix = await db.macroIndicator.findFirst({
    where: { indicatorName: 'VIX' },
    orderBy: { date: 'desc' },
  });

  if (!latestVix) {
    return { vix_level: null, label: 'Unknown', confidence: 0 };
  }

  const vix = latestVix.value;
  let label: string;

  if (vix < VIX_LOW) label = 'Low';
  else if (vix < VIX_NORMAL) label = 'Normal';
  else if (vix < VIX_HIGH) label = 'High';
  else label = 'Crisis';

  return { vix_level: Math.round(vix * 100) / 100, label, confidence: 0.85 };
}

async function latestMacroValue(db: PrismaClient, name: string): Promise<number | null> {
  const row = await db.macroIndicator.findFirst({
    where: { indicatorName: name },
    orderBy: { date: 'desc' },
  });
  return row ? row.value : null;
}

async function indicatorTrend(db: PrismaClient, name: string, n: number = 3): Promise<string> {
  const rows = await db.macroIndicator.findMany({
    where: { indicatorName: name },
    orderBy: { date: 'desc' },
    take: n,
  });

  if (rows.length < 2) return 'Unknown';

  const values = rows.reverse().map(r => r.value);
  const diff = values[values.length - 1] - values[0];
  if (Math.abs(diff) < 0.05) return 'Flat';
  return diff > 0 ? 'Rising' : 'Falling';
}

async function macroRegime(db: PrismaClient): Promise<{
  label: string;
  signals: Record<string, string>;
  yield_curve_spread: number | null;
  confidence: number;
}> {
  const signals: Record<string, string> = {};
  const confidence = 0.5;

  // Yield curve
  const tenY = await latestMacroValue(db, '10y_yield');
  const twoY = await latestMacroValue(db, '2y_yield');
  let yc: number | null = null;

  if (tenY !== null && twoY !== null) {
    yc = tenY - twoY;
    if (yc < -0.2) signals.yield_curve = 'Inverted';
    else if (yc < 0.5) signals.yield_curve = 'Flat';
    else signals.yield_curve = 'Normal';
  } else {
    signals.yield_curve = 'Unknown';
  }

  signals.fed_funds = await indicatorTrend(db, 'fed_funds_rate');
  signals.unemployment = await indicatorTrend(db, 'unemployment_rate');

  let bearishCount = 0;
  let bullishCount = 0;

  if (signals.yield_curve === 'Inverted') bearishCount += 2;
  else if (signals.yield_curve === 'Normal') bullishCount += 1;

  if (signals.fed_funds === 'Falling') bullishCount += 1;
  else if (signals.fed_funds === 'Rising') bearishCount += 1;

  if (signals.unemployment === 'Rising') bearishCount += 1;
  else if (signals.unemployment === 'Falling') bullishCount += 1;

  let label: string;
  if (bearishCount >= 3) label = 'Contractionary';
  else if (bearishCount >= 2) label = 'Late_Cycle';
  else if (bullishCount >= 2) label = 'Expansionary';
  else label = 'Neutral';

  return { label, signals, yield_curve_spread: yc, confidence };
}

export async function detectRegime(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();

  const trendResult = await trendRegime(db);
  const vixResult = await vixRegime(db);
  const macroResult = await macroRegime(db);

  // Weighted voting
  let voteTotal = 0;
  let weightTotal = 0;

  // Trend vote (replaces HMM)
  if (trendResult) {
    const trendMap: Record<string, number> = { Bull: 1.0, Sideways: 0.0, Bear: -1.0 };
    voteTotal += (trendMap[trendResult.label] || 0) * VOTE_WEIGHTS.trend;
    weightTotal += VOTE_WEIGHTS.trend;
  }

  // VIX vote
  if (vixResult.label !== 'Unknown') {
    const vixMap: Record<string, number> = { Low: 1.0, Normal: 0.3, High: -0.5, Crisis: -1.0 };
    voteTotal += (vixMap[vixResult.label] || 0) * VOTE_WEIGHTS.vix;
    weightTotal += VOTE_WEIGHTS.vix;
  }

  // Macro vote
  const macroMap: Record<string, number> = {
    Expansionary: 1.0, Neutral: 0.0, Late_Cycle: -0.5, Contractionary: -1.0,
  };
  voteTotal += (macroMap[macroResult.label] || 0) * VOTE_WEIGHTS.macro;
  weightTotal += VOTE_WEIGHTS.macro;

  const combinedScore = weightTotal > 0 ? voteTotal / weightTotal : 0;

  // Combined label with crisis override
  let combinedLabel: string;
  if (vixResult.label === 'Crisis') combinedLabel = 'CRISIS';
  else if (combinedScore > 0.3) combinedLabel = 'RISK_ON';
  else if (combinedScore < -0.3) combinedLabel = 'RISK_OFF';
  else combinedLabel = 'NEUTRAL';

  // Average confidence
  const confidences: number[] = [];
  if (trendResult) confidences.push(trendResult.confidence);
  confidences.push(vixResult.confidence || 0.5);
  confidences.push(macroResult.confidence);
  const avgConfidence = mean(confidences);

  // Persist
  const todayDate = startOfDay();
  await db.regimeState.deleteMany({ where: { date: todayDate } });
  await db.regimeState.create({
    data: {
      date: todayDate,
      regimeLabel: combinedLabel,
      confidence: Math.round(avgConfidence * 10000) / 10000,
      vixRegime: vixResult.label,
      yieldCurveState: macroResult.signals.yield_curve || null,
      breadthScore: null,
      hmmState: trendResult?.state ?? null,
    },
  });

  console.log(`Regime detected: ${combinedLabel} (confidence ${avgConfidence.toFixed(2)})`);

  return {
    date: toDateString(todayDate),
    regime_label: combinedLabel,
    combined_score: Math.round(combinedScore * 10000) / 10000,
    confidence: Math.round(avgConfidence * 10000) / 10000,
    hmm: trendResult ? { state: trendResult.state, label: trendResult.label, confidence: trendResult.confidence } : null,
    vix: vixResult,
    macro: macroResult,
  };
}
