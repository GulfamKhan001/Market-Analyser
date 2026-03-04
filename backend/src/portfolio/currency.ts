/**
 * Currency exposure analysis for USD/INR.
 * Uses ExchangeRate-API (current rate) and Frankfurter API (historical rates).
 * No Yahoo Finance dependency.
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { round, dailyReturns, std } from '../utils/math';

const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/USD';
const FRANKFURTER_API = 'https://api.frankfurter.dev/v1';

async function fetchUsdInrRate(): Promise<number> {
  // Primary: ExchangeRate-API
  try {
    const resp = await axios.get(EXCHANGE_RATE_API, { timeout: 10000 });
    const rate = resp.data?.rates?.INR;
    if (rate && rate > 0) return rate;
  } catch (e) {
    console.warn('ExchangeRate-API failed, trying Frankfurter:', e);
  }

  // Fallback: Frankfurter API
  try {
    const resp = await axios.get(`${FRANKFURTER_API}/latest?from=USD&to=INR`, { timeout: 10000 });
    const rate = resp.data?.rates?.INR;
    if (rate && rate > 0) return rate;
  } catch (e) {
    console.error('Frankfurter USDINR fallback failed:', e);
  }

  return 85.0; // last-resort hardcoded fallback
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function computeFxVolatility(): Promise<number> {
  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const url = `${FRANKFURTER_API}/${formatDate(startDate)}..${formatDate(endDate)}?from=USD&to=INR`;
    const resp = await axios.get(url, { timeout: 15000 });

    const rates = resp.data?.rates;
    if (!rates) return 0;

    // Extract daily closing rates sorted by date
    const dates = Object.keys(rates).sort();
    const closes = dates
      .map(d => rates[d]?.INR)
      .filter((v): v is number => v !== undefined && v !== null);

    if (closes.length < 10) return 0;

    const returns = dailyReturns(closes);
    const vol = std(returns, 1) * Math.sqrt(252);
    return round(vol * 100, 2);
  } catch (e) {
    console.error('FX volatility computation failed:', e);
    return 0;
  }
}

export async function computeCurrencyExposure(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const positions = await db.portfolioPosition.findMany();

  let totalValueUsd = 0;
  for (const p of positions) {
    const price = p.currentPrice || Number(p.entryPrice);
    totalValueUsd += price * Number(p.quantity);
  }

  const usdInrRate = await fetchUsdInrRate();
  const totalValueInr = totalValueUsd * usdInrRate;

  // Sensitivity analysis
  const sensitivityMoves = [-10, -5, 0, 5, 10];
  const inrSensitivity = sensitivityMoves.map(movePct => {
    const adjustedRate = usdInrRate * (1 + movePct / 100);
    const adjustedInr = totalValueUsd * adjustedRate;
    return {
      inr_move_pct: movePct,
      adjusted_rate: round(adjustedRate, 2),
      portfolio_value_inr: round(adjustedInr, 2),
      change_inr: round(adjustedInr - totalValueInr, 2),
    };
  });

  const fxVolatility = await computeFxVolatility();

  return {
    usd_inr_rate: round(usdInrRate, 2),
    portfolio_value_usd: round(totalValueUsd, 2),
    portfolio_value_inr: round(totalValueInr, 2),
    fx_volatility_pct: fxVolatility,
    inr_sensitivity: inrSensitivity,
  };
}
