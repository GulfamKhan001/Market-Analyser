/**
 * Regime detection routes — 4 endpoints.
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../db/client';
import { detectRegime } from '../analysis/regime';
import { fetchPrices } from '../ingestion/yahoo';
import { fetchMacroIndicators } from '../ingestion/fred';

const router = Router();

// GET /regime/current
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();

    const latest = await db.regimeState.findFirst({
      orderBy: { date: 'desc' },
    });

    const staleMs = 1 * 24 * 60 * 60 * 1000;
    const hasUnknowns = latest && (latest.vixRegime === 'Unknown' || latest.yieldCurveState === 'Unknown');
    if (!latest || Date.now() - latest.date.getTime() > staleMs || hasUnknowns) {
      await detectRegime(db);
      // Re-read from DB to get consistent flat shape
      const fresh = await db.regimeState.findFirst({ orderBy: { date: 'desc' } });
      if (fresh) {
        res.json({
          date: fresh.date.toISOString().split('T')[0],
          regime_label: fresh.regimeLabel,
          confidence: fresh.confidence,
          vix_regime: fresh.vixRegime,
          yield_curve_state: fresh.yieldCurveState,
          breadth_score: fresh.breadthScore,
          hmm_state: fresh.hmmState,
        });
        return;
      }
    }

    res.json({
      date: latest!.date.toISOString().split('T')[0],
      regime_label: latest!.regimeLabel,
      confidence: latest!.confidence,
      vix_regime: latest!.vixRegime,
      yield_curve_state: latest!.yieldCurveState,
      breadth_score: latest!.breadthScore,
      hmm_state: latest!.hmmState,
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /regime/history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const days = parseInt(req.query.days as string) || 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const states = await db.regimeState.findMany({
      where: { date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    res.json({
      count: states.length,
      history: states.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        regime_label: s.regimeLabel,
        confidence: s.confidence,
        vix_regime: s.vixRegime,
        hmm_state: s.hmmState,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /regime/macro-dashboard
router.get('/macro-dashboard', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const MACRO_NAMES = ['GDP', 'CPI', 'unemployment_rate', 'fed_funds_rate', '10y_yield', '2y_yield', 'VIX'];

    const indicators: Record<string, any> = {};
    const history: Record<string, any[]> = {};

    for (const name of MACRO_NAMES) {
      const latest = await db.macroIndicator.findFirst({
        where: { indicatorName: name },
        orderBy: { date: 'desc' },
      });
      if (latest) {
        indicators[name] = { value: latest.value, date: latest.date.toISOString().split('T')[0] };
      }

      const recent = await db.macroIndicator.findMany({
        where: { indicatorName: name },
        orderBy: { date: 'desc' },
        take: 12,
      });
      history[name] = recent.reverse().map((r) => ({
        date: r.date.toISOString().split('T')[0],
        value: r.value,
      }));
    }

    let yieldSpread: number | null = null;
    if (indicators['10y_yield'] && indicators['2y_yield']) {
      yieldSpread = indicators['10y_yield'].value - indicators['2y_yield'].value;
    }

    res.json({
      current: indicators,
      history,
      yield_spread: yieldSpread,
      yield_curve_inverted: yieldSpread !== null && yieldSpread < 0,
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /regime/refresh
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();

    // 1. Ensure SPY has enough history for SMA(200) trend detection
    const spyCount = await db.stockPrice.count({
      where: { ticker: 'SPY' },
    });
    if (spyCount < 200) {
      try { await fetchPrices('SPY', '2y', db); } catch { /* best-effort */ }
    } else {
      try { await fetchPrices('SPY', '5d', db); } catch { /* best-effort */ }
    }

    // 2. Fetch macro indicators (VIX, yields, Fed funds, etc.)
    try { await fetchMacroIndicators(db); } catch { /* best-effort */ }

    // 3. Run regime detection with fresh data
    const result = await detectRegime(db);
    res.json({ status: 'refreshed', regime: result });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

export default router;
