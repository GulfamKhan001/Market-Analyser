/**
 * Fundamental analysis scoring engine.
 * Scores four dimensions (value, quality, growth, dividend) and returns a weighted total.
 */

import { PrismaClient, Fundamental } from '@prisma/client';
import { getPrisma } from '../db/client';
import { mean as arrMean } from '../utils/math';

const WEIGHTS = {
  value: 0.25,
  quality: 0.30,
  growth: 0.30,
  dividend: 0.15,
};

function isValid(val: number | null | undefined): val is number {
  return val !== null && val !== undefined && !isNaN(val);
}

function valueScore(f: Fundamental): number {
  const components: number[] = [];

  // PE ratio: lower is better
  const pe = f.peRatio;
  if (isValid(pe) && pe > 0) {
    if (pe < 10) components.push(90);
    else if (pe < 15) components.push(75);
    else if (pe < 20) components.push(60);
    else if (pe < 30) components.push(40);
    else components.push(20);
  } else components.push(50);

  // PB ratio: lower is better
  const pb = f.pbRatio;
  if (isValid(pb) && pb > 0) {
    if (pb < 1.0) components.push(90);
    else if (pb < 2.0) components.push(70);
    else if (pb < 4.0) components.push(50);
    else components.push(25);
  } else components.push(50);

  // PS ratio
  const ps = f.psRatio;
  if (isValid(ps) && ps > 0) {
    if (ps < 1.0) components.push(85);
    else if (ps < 3.0) components.push(65);
    else if (ps < 6.0) components.push(45);
    else components.push(20);
  } else components.push(50);

  // PEG ratio
  const peg = f.pegRatio;
  if (isValid(peg) && peg > 0) {
    if (peg < 1.0) components.push(85);
    else if (peg < 1.5) components.push(65);
    else if (peg < 2.5) components.push(45);
    else components.push(25);
  } else components.push(50);

  // EV/EBITDA
  const ev = f.evToEbitda;
  if (isValid(ev) && ev > 0) {
    if (ev < 8) components.push(85);
    else if (ev < 12) components.push(65);
    else if (ev < 18) components.push(45);
    else components.push(25);
  } else components.push(50);

  return arrMean(components);
}

function qualityScore(f: Fundamental): number {
  const components: number[] = [];

  // ROE
  const roe = f.roe;
  if (isValid(roe)) {
    if (roe > 25) components.push(90);
    else if (roe > 15) components.push(75);
    else if (roe > 10) components.push(55);
    else if (roe > 0) components.push(35);
    else components.push(15);
  } else components.push(50);

  // ROA
  const roa = f.roa;
  if (isValid(roa)) {
    if (roa > 15) components.push(90);
    else if (roa > 8) components.push(70);
    else if (roa > 3) components.push(50);
    else if (roa > 0) components.push(30);
    else components.push(15);
  } else components.push(50);

  // Debt-to-equity: lower is better
  const de = f.debtToEquity;
  if (isValid(de)) {
    if (de < 0.3) components.push(90);
    else if (de < 0.7) components.push(70);
    else if (de < 1.5) components.push(50);
    else if (de < 3.0) components.push(30);
    else components.push(15);
  } else components.push(50);

  // Current ratio
  const cr = f.currentRatio;
  if (isValid(cr)) {
    if (cr > 3.0) components.push(85);
    else if (cr > 2.0) components.push(70);
    else if (cr > 1.5) components.push(55);
    else if (cr > 1.0) components.push(40);
    else components.push(20);
  } else components.push(50);

  // Free cash flow
  const fcf = f.freeCashFlow;
  if (isValid(fcf)) {
    components.push(fcf > 0 ? 70 : 25);
  } else components.push(50);

  return arrMean(components);
}

function growthScore(f: Fundamental): number {
  const components: number[] = [];

  for (const rawVal of [f.revenueGrowth, f.earningsGrowth]) {
    if (isValid(rawVal)) {
      const pct = Math.abs(rawVal) < 5 ? rawVal * 100 : rawVal;
      if (pct > 30) components.push(90);
      else if (pct > 15) components.push(75);
      else if (pct > 5) components.push(55);
      else if (pct > 0) components.push(40);
      else components.push(20);
    } else components.push(50);
  }

  return arrMean(components);
}

function dividendScore(f: Fundamental): number {
  const dy = f.dividendYield;
  if (!isValid(dy)) return 50;

  const pct = dy < 1 ? dy * 100 : dy;
  if (pct > 5) return 85;
  if (pct > 3) return 70;
  if (pct > 1.5) return 55;
  if (pct > 0) return 40;
  return 30;
}

export async function computeFundamentalScore(
  ticker: string,
  prisma?: PrismaClient,
): Promise<Record<string, any>> {
  const db = prisma || getPrisma();

  const fund = await db.fundamental.findFirst({
    where: { ticker },
    orderBy: { dateFetched: 'desc' },
  });

  if (!fund) {
    console.warn(`No fundamental data for ${ticker}`);
    return { ticker, error: 'no_fundamental_data' };
  }

  const value = valueScore(fund);
  const quality = qualityScore(fund);
  const growth = growthScore(fund);
  const dividend = dividendScore(fund);

  const total =
    value * WEIGHTS.value +
    quality * WEIGHTS.quality +
    growth * WEIGHTS.growth +
    dividend * WEIGHTS.dividend;

  return {
    ticker,
    date_fetched: fund.dateFetched.toISOString().split('T')[0],
    value_score: Math.round(value * 100) / 100,
    quality_score: Math.round(quality * 100) / 100,
    growth_score: Math.round(growth * 100) / 100,
    dividend_score: Math.round(dividend * 100) / 100,
    fundamental_score: Math.round(total * 100) / 100,
    sector: fund.sector,
    industry: fund.industry,
  };
}
