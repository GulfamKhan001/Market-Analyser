/**
 * Analysis routes — 5 endpoints.
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../db/client';
import { analyzeTicker } from '../analysis/technical';
import { computeFundamentalScore } from '../analysis/fundamental';
import { screenStocks } from '../analysis/screener';
import { multiTimeframeConfluence } from '../analysis/indicators';
import { getSettings } from '../config';
import { bulkFetchPrices, fetchFundamentals } from '../ingestion/yahoo';

const router = Router();

// GET /analysis/technical/:ticker
router.get('/technical/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const timeframe = (req.query.timeframe as string) || 'daily';

    let signal = await db.technicalSignal.findFirst({
      where: { ticker, timeframe },
      orderBy: { date: 'desc' },
    });

    const staleMs = 1 * 24 * 60 * 60 * 1000;
    if (!signal || Date.now() - signal.date.getTime() > staleMs) {
      const result = await analyzeTicker(ticker, db);
      if (result.error) {
        res.status(400).json({ detail: result.error });
        return;
      }
      signal = await db.technicalSignal.findFirst({
        where: { ticker, timeframe },
        orderBy: { date: 'desc' },
      });
    }

    if (!signal) {
      res.status(404).json({ detail: `No technical data for ${ticker}` });
      return;
    }

    res.json({
      ticker,
      date: signal.date.toISOString().split('T')[0],
      timeframe: signal.timeframe,
      scores: {
        composite: signal.compositeScore,
        trend: signal.trendScore,
        momentum: signal.momentumScore,
        volatility: signal.volatilityScore,
        volume: signal.volumeScore,
      },
      indicators: {
        rsi: signal.rsi,
        macd: signal.macd,
        macd_signal: signal.macdSignal,
        macd_hist: signal.macdHist,
        adx: signal.adx,
        stochastic_k: signal.stochasticK,
        stochastic_d: signal.stochasticD,
        bb_upper: signal.bbUpper,
        bb_middle: signal.bbMiddle,
        bb_lower: signal.bbLower,
        atr: signal.atr,
        obv: signal.obv,
        sma_20: signal.sma20,
        sma_50: signal.sma50,
        sma_200: signal.sma200,
        ema_12: signal.ema12,
        ema_26: signal.ema26,
      },
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /analysis/fundamental/:ticker
router.get('/fundamental/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const result = await computeFundamentalScore(ticker, db);
    if (result.error) {
      res.status(400).json({ detail: result.error });
      return;
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /analysis/confluence/:ticker
router.get('/confluence/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const result = await multiTimeframeConfluence(ticker, db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /analysis/scan — bulk-analyze all default tickers
router.post('/scan', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const settings = getSettings();
    const tickers = settings.DEFAULT_TICKERS;

    // 1. Fetch prices for all tickers
    await bulkFetchPrices(tickers, '1y', db);

    // 2. Run technical + fundamental analysis for each
    const results: { ticker: string; status: string }[] = [];
    for (const ticker of tickers) {
      try {
        await analyzeTicker(ticker, db);
        try { await fetchFundamentals(ticker, db); } catch { /* best-effort */ }
        results.push({ ticker, status: 'ok' });
      } catch (e: any) {
        results.push({ ticker, status: e.message });
      }
    }

    res.json({ scanned: results.length, results });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /analysis/screener
router.get('/screener', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const minComposite = parseFloat(req.query.min_composite as string) || 50;
    const minFundamental = parseFloat(req.query.min_fundamental as string) || 50;
    const sector = (req.query.sector as string) || undefined;
    const minVolume = req.query.min_volume ? parseInt(req.query.min_volume as string) : undefined;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);

    const filters = {
      min_composite_score: minComposite,
      min_fundamental_score: minFundamental,
      sector,
      min_volume: minVolume,
    };

    const results = await screenStocks(db, filters);
    const trimmed = results.slice(0, limit);
    res.json({ count: trimmed.length, results: trimmed });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /analysis/full/:ticker
router.get('/full/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();

    const technical = await analyzeTicker(ticker, db);
    const fundamental = await computeFundamentalScore(ticker, db);
    const confluence = await multiTimeframeConfluence(ticker, db);

    res.json({ ticker, technical, fundamental, confluence });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

export default router;
