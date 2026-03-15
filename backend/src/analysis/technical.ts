/**
 * Technical analysis engine.
 * Computes indicators via technicalindicators, scores each dimension
 * (trend, momentum, volatility, volume), and produces a composite score.
 */

import {
  RSI, MACD, SMA, EMA, ADX, BollingerBands, ATR, OBV,
  Stochastic, WilliamsR, ROC,
} from 'technicalindicators';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { safeFloat, clip, round } from '../utils/math';
import { daysAgo, startOfDay, toDateString } from '../utils/format';

// Weight configuration
const WEIGHTS = {
  trend: 0.30,
  momentum: 0.25,
  volatility: 0.20,
  volume: 0.15,
  pattern: 0.10,
};

interface OHLCV {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Indicators {
  sma20: number[];
  sma50: number[];
  sma200: number[];
  ema12: number[];
  ema26: number[];
  adx: number[];
  macd: { MACD: number; signal: number; histogram: number }[];
  rsi: number[];
  stochastic: { k: number; d: number }[];
  williamsR: number[];
  roc: number[];
  bbands: { upper: number; middle: number; lower: number }[];
  atr: number[];
  obv: number[];
  volumeSmaRatio: number[];
}

function computeIndicators(data: OHLCV[]): Indicators {
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  const sma20 = SMA.calculate({ period: 20, values: closes });
  const sma50 = SMA.calculate({ period: 50, values: closes });
  const sma200 = SMA.calculate({ period: 200, values: closes });
  const ema12 = EMA.calculate({ period: 12, values: closes });
  const ema26 = EMA.calculate({ period: 26, values: closes });

  let adx: any[] = [];
  try {
    adx = ADX.calculate({ period: 14, close: closes, high: highs, low: lows });
  } catch { /* insufficient data */ }

  let macd: any[] = [];
  try {
    macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
  } catch { /* insufficient data */ }

  let rsi: number[] = [];
  try {
    rsi = RSI.calculate({ period: 14, values: closes });
  } catch { /* insufficient data */ }

  let stochastic: { k: number; d: number }[] = [];
  try {
    stochastic = Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
      signalPeriod: 3,
    });
  } catch { /* insufficient data */ }

  let williamsR: number[] = [];
  try {
    williamsR = WilliamsR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });
  } catch { /* insufficient data */ }

  let roc: number[] = [];
  try {
    roc = ROC.calculate({ period: 10, values: closes });
  } catch { /* insufficient data */ }

  let bbands: { upper: number; middle: number; lower: number }[] = [];
  try {
    bbands = BollingerBands.calculate({
      period: 20,
      values: closes,
      stdDev: 2,
    });
  } catch { /* insufficient data */ }

  let atr: number[] = [];
  try {
    atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
  } catch { /* insufficient data */ }

  let obv: number[] = [];
  try {
    obv = OBV.calculate({ close: closes, volume: volumes });
  } catch { /* insufficient data */ }

  // Volume SMA ratio
  const volSma20 = SMA.calculate({ period: 20, values: volumes });
  const volumeSmaRatio: number[] = [];
  const offset = volumes.length - volSma20.length;
  for (let i = 0; i < volSma20.length; i++) {
    const ratio = volSma20[i] !== 0 ? volumes[i + offset] / volSma20[i] : 1;
    volumeSmaRatio.push(ratio);
  }

  return {
    sma20, sma50, sma200, ema12, ema26, adx, macd,
    rsi, stochastic, williamsR, roc, bbands, atr, obv,
    volumeSmaRatio,
  };
}

function last<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function trendScore(close: number, ind: Indicators): number {
  let score = 50;

  const sma20 = last(ind.sma20);
  const sma50 = last(ind.sma50);
  const sma200 = last(ind.sma200);

  // Price vs MAs
  if (sma20 !== undefined && close > sma20) score += 5; else if (sma20 !== undefined) score -= 5;
  if (sma50 !== undefined && close > sma50) score += 7; else if (sma50 !== undefined) score -= 7;
  if (sma200 !== undefined && close > sma200) score += 10; else if (sma200 !== undefined) score -= 10;

  // MA alignment
  if (sma20 !== undefined && sma50 !== undefined && sma200 !== undefined) {
    if (sma20 > sma50 && sma50 > sma200) score += 10;
    else if (sma20 < sma50 && sma50 < sma200) score -= 10;
  }

  // ADX
  const adxVal = last(ind.adx);
  if (adxVal !== undefined) {
    if (adxVal > 25) score += 5;
    else if (adxVal < 15) score -= 3;
  }

  // MACD histogram
  const macdVal = last(ind.macd);
  if (macdVal?.histogram !== undefined) {
    score += clip(macdVal.histogram * 2, -8, 8);
  }

  return clip(score, 0, 100);
}

function momentumScore(ind: Indicators): number {
  let score = 50;

  const rsi = last(ind.rsi);
  if (rsi !== undefined) {
    if (rsi > 70) score -= (rsi - 70) * 0.5;
    else if (rsi < 30) score += (30 - rsi) * 0.5;
    else score += (rsi - 50) * 0.3;
  }

  const stoch = last(ind.stochastic);
  if (stoch) {
    if (stoch.k > stoch.d) score += 5; else score -= 5;
  }

  const willr = last(ind.williamsR);
  if (willr !== undefined) {
    if (willr > -20) score -= 5;
    else if (willr < -80) score += 5;
  }

  const rocVal = last(ind.roc);
  if (rocVal !== undefined) {
    score += clip(rocVal * 1.5, -10, 10);
  }

  return clip(score, 0, 100);
}

function volatilityScore(close: number, ind: Indicators): number {
  let score = 50;

  const bb = last(ind.bbands);
  if (bb) {
    const bbRange = bb.upper - bb.lower;
    if (bbRange > 0) {
      const position = (close - bb.lower) / bbRange;
      if (position > 0.8) score -= 10;
      else if (position < 0.2) score += 10;
      else score += 5;
    }

    if (bb.middle !== 0) {
      const bbWidth = (bb.upper - bb.lower) / bb.middle;
      if (bbWidth < 0.04) score += 8;
      else if (bbWidth > 0.15) score -= 8;
    }
  }

  const atrVal = last(ind.atr);
  if (atrVal !== undefined && close !== 0) {
    const atrPct = atrVal / close;
    if (atrPct < 0.01) score += 5;
    else if (atrPct > 0.04) score -= 10;
  }

  return clip(score, 0, 100);
}

function volumeScore(ind: Indicators): number {
  let score = 50;

  const volRatio = last(ind.volumeSmaRatio);
  if (volRatio !== undefined) {
    if (volRatio > 2.0) score += 15;
    else if (volRatio > 1.3) score += 8;
    else if (volRatio < 0.5) score -= 10;
    else if (volRatio < 0.7) score -= 5;
  }

  const obvVal = last(ind.obv);
  if (obvVal !== undefined) {
    if (obvVal > 0) score += 5; else score -= 5;
  }

  return clip(score, 0, 100);
}

function computeCompositeScore(close: number, ind: Indicators) {
  const trend = trendScore(close, ind);
  const momentum = momentumScore(ind);
  const volatility = volatilityScore(close, ind);
  const volume = volumeScore(ind);
  const pattern = 50;

  const composite =
    trend * WEIGHTS.trend +
    momentum * WEIGHTS.momentum +
    volatility * WEIGHTS.volatility +
    volume * WEIGHTS.volume +
    pattern * WEIGHTS.pattern;

  return {
    trend_score: round(trend, 2),
    momentum_score: round(momentum, 2),
    volatility_score: round(volatility, 2),
    volume_score: round(volume, 2),
    pattern_score: round(pattern, 2),
    composite_score: round(composite, 2),
  };
}

export async function analyzeTicker(
  ticker: string,
  prisma?: PrismaClient,
  lookbackDays: number = 400,
  timeframe: string = 'daily',
): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const cutoff = daysAgo(lookbackDays);

  const rows = await db.stockPrice.findMany({
    where: { ticker, date: { gte: cutoff } },
    orderBy: { date: 'asc' },
  });

  if (rows.length < 30) {
    console.warn(`Not enough price data for ${ticker} (${rows.length} rows)`);
    return { ticker, error: 'insufficient_data', rows: rows.length };
  }

  const data: OHLCV[] = rows.map(r => ({
    date: r.date,
    open: r.open || 0,
    high: r.high || 0,
    low: r.low || 0,
    close: r.close || 0,
    volume: Number(r.volume ?? 0),
  }));

  const ind = computeIndicators(data);
  const latestClose = data[data.length - 1].close;
  const latestDate = data[data.length - 1].date;
  const scores = computeCompositeScore(latestClose, ind);

  // Get latest indicator values
  const latestMacd = last(ind.macd);
  const latestBb = last(ind.bbands);
  const latestStoch = last(ind.stochastic);

  const signalData = {
    ticker,
    date: startOfDay(latestDate),
    timeframe,
    rsi: safeFloat(last(ind.rsi)),
    stochasticK: safeFloat(latestStoch?.k),
    stochasticD: safeFloat(latestStoch?.d),
    williamsR: safeFloat(last(ind.williamsR)),
    roc: safeFloat(last(ind.roc)),
    macd: safeFloat(latestMacd?.MACD),
    macdSignal: safeFloat(latestMacd?.signal),
    macdHist: safeFloat(latestMacd?.histogram),
    adx: safeFloat(last(ind.adx)),
    sma20: safeFloat(last(ind.sma20)),
    sma50: safeFloat(last(ind.sma50)),
    sma200: safeFloat(last(ind.sma200)),
    ema12: safeFloat(last(ind.ema12)),
    ema26: safeFloat(last(ind.ema26)),
    bbUpper: safeFloat(latestBb?.upper),
    bbMiddle: safeFloat(latestBb?.middle),
    bbLower: safeFloat(latestBb?.lower),
    atr: safeFloat(last(ind.atr)),
    obv: safeFloat(last(ind.obv)),
    volumeSmaRatio: safeFloat(last(ind.volumeSmaRatio)),
    compositeScore: scores.composite_score,
    trendScore: scores.trend_score,
    momentumScore: scores.momentum_score,
    volatilityScore: scores.volatility_score,
    volumeScore: scores.volume_score,
  };

  // Upsert: delete existing then create
  await db.technicalSignal.deleteMany({
    where: { ticker, date: startOfDay(latestDate), timeframe },
  });
  await db.technicalSignal.create({ data: signalData });

  console.log(`Saved TechnicalSignal for ${ticker} on ${toDateString(latestDate)}`);

  return {
    ticker,
    date: toDateString(latestDate),
    timeframe,
    close: latestClose,
    scores,
    indicators: {
      rsi: safeFloat(last(ind.rsi)),
      macd_hist: safeFloat(latestMacd?.histogram),
      adx: safeFloat(last(ind.adx)),
      atr: safeFloat(last(ind.atr)),
      volume_sma_ratio: safeFloat(last(ind.volumeSmaRatio)),
    },
  };
}
