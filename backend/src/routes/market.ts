/**
 * Market data routes — 6 endpoints.
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../db/client';
import { fetchPrices, fetchFundamentals } from '../ingestion/yahoo';
import { fetchMacroIndicators } from '../ingestion/fred';
import { fetchNews } from '../ingestion/finnhub';

const router = Router();

const PERIOD_DAYS: Record<string, number> = {
  '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825,
};

// GET /market/prices/:ticker
router.get('/prices/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const period = (req.query.period as string) || '6mo';
    const days = PERIOD_DAYS[period] || 180;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let prices = await db.stockPrice.findMany({
      where: { ticker, date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    if (prices.length === 0) {
      await fetchPrices(ticker, period, db);
      prices = await db.stockPrice.findMany({
        where: { ticker, date: { gte: startDate } },
        orderBy: { date: 'asc' },
      });
    }

    res.json({
      ticker,
      count: prices.length,
      data: prices.map((p) => ({
        date: p.date.toISOString().split('T')[0],
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        adj_close: p.adjClose,
        volume: p.volume,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /market/fundamentals/:ticker
router.get('/fundamentals/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();

    let fund = await db.fundamental.findFirst({
      where: { ticker },
      orderBy: { dateFetched: 'desc' },
    });

    const staleMs = 7 * 24 * 60 * 60 * 1000;
    if (!fund || Date.now() - fund.dateFetched.getTime() > staleMs) {
      await fetchFundamentals(ticker, db);
      fund = await db.fundamental.findFirst({
        where: { ticker },
        orderBy: { dateFetched: 'desc' },
      });
    }

    if (!fund) {
      res.status(404).json({ detail: `No fundamentals found for ${ticker}` });
      return;
    }

    res.json({
      ticker,
      date_fetched: fund.dateFetched.toISOString().split('T')[0],
      market_cap: fund.marketCap,
      pe_ratio: fund.peRatio,
      pb_ratio: fund.pbRatio,
      ps_ratio: fund.psRatio,
      peg_ratio: fund.pegRatio,
      ev_to_ebitda: fund.evToEbitda,
      roe: fund.roe,
      roa: fund.roa,
      debt_to_equity: fund.debtToEquity,
      current_ratio: fund.currentRatio,
      free_cash_flow: fund.freeCashFlow,
      revenue_growth: fund.revenueGrowth,
      earnings_growth: fund.earningsGrowth,
      dividend_yield: fund.dividendYield,
      sector: fund.sector,
      industry: fund.industry,
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /market/macro
router.get('/macro', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const MACRO_NAMES = ['GDP', 'CPI', 'unemployment_rate', 'fed_funds_rate', '10y_yield', '2y_yield', 'VIX'];

    const indicators: Record<string, any> = {};
    for (const name of MACRO_NAMES) {
      const latest = await db.macroIndicator.findFirst({
        where: { indicatorName: name },
        orderBy: { date: 'desc' },
      });
      if (latest) {
        indicators[name] = { value: latest.value, date: latest.date.toISOString().split('T')[0] };
      }
    }

    if (Object.keys(indicators).length === 0) {
      await fetchMacroIndicators(db);
      for (const name of MACRO_NAMES) {
        const latest = await db.macroIndicator.findFirst({
          where: { indicatorName: name },
          orderBy: { date: 'desc' },
        });
        if (latest) {
          indicators[name] = { value: latest.value, date: latest.date.toISOString().split('T')[0] };
        }
      }
    }

    res.json({ indicators });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /market/news/:ticker
router.get('/news/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);

    let news = await db.newsSentiment.findMany({
      where: { ticker },
      orderBy: { date: 'desc' },
      take: limit,
    });

    if (news.length === 0) {
      await fetchNews(ticker, db);
      news = await db.newsSentiment.findMany({
        where: { ticker },
        orderBy: { date: 'desc' },
        take: limit,
      });
    }

    res.json({
      ticker,
      count: news.length,
      articles: news.map((n) => ({
        date: n.date.toISOString().split('T')[0],
        headline: n.headline,
        source: n.source,
        sentiment_score: n.sentimentScore,
        summary: n.summary,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /market/refresh/:ticker
router.post('/refresh/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    await fetchPrices(ticker, '1y', db);
    await fetchFundamentals(ticker, db);
    await fetchNews(ticker, db);
    res.json({ status: 'refreshed', ticker });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /market/refresh-macro
router.post('/refresh-macro', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    await fetchMacroIndicators(db);
    res.json({ status: 'refreshed' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

export default router;
