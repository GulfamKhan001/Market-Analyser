/**
 * Portfolio health scoring — composite 0-100 score from 4 sub-scores.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { computeRiskMetrics, computeConcentration, correlationClusters } from './risk';
import { computeTwr, getPortfolioSummary } from './manager';

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

export async function computeHealthScore(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();

  const summary = await getPortfolioSummary(db);

  // Return zeroes for empty portfolio
  if (!summary.position_count) {
    return {
      total: 0, diversification: 0, risk: 0, performance: 0, balance: 0,
      details: { position_count: 0, sector_hhi: 0, top_3_pct: 0, sharpe: null, max_drawdown: null, twr_annualized: 0, beta: null, cluster_count: 0 },
    };
  }

  const riskMetrics = await computeRiskMetrics(db);
  const concentration = await computeConcentration(db);
  const clusters = await correlationClusters(db);
  const twr = await computeTwr(db);

  // Sector HHI
  const hhi = riskMetrics.sector_concentration_hhi || 0;

  const diversification = scoreDiversification(concentration, hhi);
  const risk = scoreRisk(riskMetrics);
  const performance = scorePerformance(twr);
  const balance = scoreBalance(riskMetrics, clusters);

  const total = diversification + risk + performance + balance;

  return {
    total: Math.round(total * 10) / 10,
    diversification: Math.round(diversification * 10) / 10,
    risk: Math.round(risk * 10) / 10,
    performance: Math.round(performance * 10) / 10,
    balance: Math.round(balance * 10) / 10,
    details: {
      position_count: summary.position_count || 0,
      sector_hhi: hhi,
      top_3_pct: concentration.top_3_pct || 0,
      sharpe: riskMetrics.sharpe_ratio ?? null,
      max_drawdown: riskMetrics.max_drawdown ?? null,
      twr_annualized: twr.twr_annualized || 0,
      beta: riskMetrics.beta ?? null,
      cluster_count: (clusters.clusters || []).length,
    },
  };
}
