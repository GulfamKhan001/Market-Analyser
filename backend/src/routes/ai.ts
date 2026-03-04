/**
 * AI reasoning routes — 3 endpoints.
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import { analyzeTicker as runTechnical } from '../analysis/technical';
import { computeFundamentalScore } from '../analysis/fundamental';
import { detectRegime } from '../analysis/regime';
import {
  getPortfolioSummary, computeTwr,
} from '../portfolio/manager';
import {
  computeRiskMetrics, computeConcentration, stressTestScenarios,
} from '../portfolio/risk';
import { computeCurrencyExposure } from '../portfolio/currency';
import { AIReasoner } from '../ai/reasoner';

const router = Router();
const reasoner = new AIReasoner();

async function buildEnhancedPortfolioContext(db: any): Promise<Record<string, any>> {
  const context: Record<string, any> = await getPortfolioSummary(db);
  try { context.risk_metrics = await computeRiskMetrics(db); } catch { context.risk_metrics = {}; }
  try { context.concentration = await computeConcentration(db); } catch { context.concentration = {}; }
  try {
    const scenarios = await stressTestScenarios(db);
    context.stress_test_summary = Object.fromEntries(
      scenarios.map((s: any) => [s.label, s.portfolio_impact_pct]),
    );
  } catch { context.stress_test_summary = {}; }
  try { context.twr = await computeTwr(db); } catch { context.twr = {}; }
  try {
    const currency = await computeCurrencyExposure(db);
    context.currency_exposure = {
      usd_inr_rate: currency.usd_inr_rate,
      portfolio_value_inr: currency.portfolio_value_inr,
    };
  } catch { context.currency_exposure = {}; }
  return context;
}

// GET /ai/analyze/:ticker
router.get('/analyze/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const deep = req.query.deep === 'true';

    const technical = await runTechnical(ticker, db);
    const fundamental = await computeFundamentalScore(ticker, db);
    const regime = await detectRegime(db);
    const portfolio = await buildEnhancedPortfolioContext(db);

    const result = await reasoner.analyzeTicker(
      ticker, technical, fundamental, regime, portfolio, deep, db,
    );

    res.json({
      ticker,
      analysis_type: deep ? 'deep' : 'standard',
      result,
    });
  } catch (e: any) {
    res.status(500).json({ detail: `AI analysis failed: ${e.message}` });
  }
});

// POST /ai/screen
router.post('/screen', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const settings = getSettings();
    let tickers: string[] = req.body.tickers || req.query.tickers;

    if (!tickers || tickers.length === 0) {
      tickers = settings.DEFAULT_TICKERS;
    }

    const tickersData: Record<string, any>[] = [];
    for (const t of tickers) {
      const ticker = t.toUpperCase();
      const technical = await runTechnical(ticker, db);
      const fundamental = await computeFundamentalScore(ticker, db);
      tickersData.push({ ticker, technical, fundamental });
    }

    const results = await reasoner.screenTickers(tickersData);
    res.json({
      count: results.length,
      screenings: results,
    });
  } catch (e: any) {
    res.status(500).json({ detail: `AI screening failed: ${e.message}` });
  }
});

// GET /ai/outlook
router.get('/outlook', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const MACRO_NAMES = ['GDP', 'CPI', 'unemployment_rate', 'fed_funds_rate', '10y_yield', '2y_yield', 'VIX'];

    const regime = await detectRegime(db);

    const macroData: Record<string, number> = {};
    for (const name of MACRO_NAMES) {
      const latest = await db.macroIndicator.findFirst({
        where: { indicatorName: name },
        orderBy: { date: 'desc' },
      });
      if (latest) macroData[name] = latest.value;
    }

    const sectorData: Record<string, number> = {};
    const signals = await db.technicalSignal.findMany({
      where: { timeframe: 'daily' },
      orderBy: { date: 'desc' },
    });
    const seen = new Set<string>();
    for (const s of signals) {
      if (!seen.has(s.ticker)) {
        sectorData[s.ticker] = s.compositeScore || 0;
        seen.add(s.ticker);
      }
    }

    const result = await reasoner.marketOutlook(regime, macroData, sectorData);
    res.json({ outlook: result });
  } catch (e: any) {
    res.status(500).json({ detail: `AI outlook failed: ${e.message}` });
  }
});

export default router;
