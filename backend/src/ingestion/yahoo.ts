/**
 * Yahoo Finance data ingestion via yahoo-finance2.
 * Fetches historical prices and fundamental data for stocks.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import { startOfDay } from '../utils/format';
import { getYahooFinance } from '../utils/yahooFinance';

const PERIOD_MAP: Record<string, string> = {
  '1mo': '1mo', '3mo': '3mo', '6mo': '6mo',
  '1y': '1y', '2y': '2y', '5y': '5y', '1d': '1d', '5d': '5d',
};

export async function fetchPrices(
  ticker: string,
  period: string = '1y',
  prisma?: PrismaClient,
): Promise<number> {
  const db = prisma || getPrisma();

  console.log(`Fetching prices for ${ticker} (period=${period})`);

  try {
    const now = new Date();
    const periodDays: Record<string, number> = {
      '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180,
      '1y': 365, '2y': 730, '5y': 1825,
    };
    const days = periodDays[period] || 365;
    const period1 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const yahooFinance = await getYahooFinance();
    const result = await yahooFinance.historical(ticker, {
      period1,
      period2: now,
    });

    if (!result || result.length === 0) {
      console.warn(`No price data returned for ${ticker}`);
      return 0;
    }

    let count = 0;
    for (const row of result) {
      const priceDate = startOfDay(row.date);

      await db.stockPrice.upsert({
        where: {
          uq_ticker_date: { ticker, date: priceDate },
        },
        update: {
          open: row.open ?? null,
          high: row.high ?? null,
          low: row.low ?? null,
          close: row.close ?? null,
          adjClose: row.adjClose ?? row.close ?? null,
          volume: row.volume ?? null,
        },
        create: {
          ticker,
          date: priceDate,
          open: row.open ?? null,
          high: row.high ?? null,
          low: row.low ?? null,
          close: row.close ?? null,
          adjClose: row.adjClose ?? row.close ?? null,
          volume: row.volume ?? null,
        },
      });
      count++;
    }

    console.log(`Upserted ${count} price rows for ${ticker}`);
    return count;
  } catch (error) {
    console.error(`Error fetching prices for ${ticker}:`, error);
    throw error;
  }
}

export async function fetchFundamentals(
  ticker: string,
  prisma?: PrismaClient,
): Promise<any> {
  const db = prisma || getPrisma();

  console.log(`Fetching fundamentals for ${ticker}`);

  try {
    const yahooFinance = await getYahooFinance();
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile'],
    });

    if (!quote) {
      console.warn(`No fundamental data returned for ${ticker}`);
      return null;
    }

    const sd = quote.summaryDetail || {} as any;
    const ks = quote.defaultKeyStatistics || {} as any;
    const fd = quote.financialData || {} as any;
    const ap = quote.assetProfile || {} as any;

    const todayDate = startOfDay();

    const safeNum = (val: any): number | null => {
      if (val === undefined || val === null) return null;
      const n = Number(val);
      return isNaN(n) ? null : n;
    };

    const data = {
      marketCap: safeNum(sd.marketCap),
      peRatio: safeNum(sd.trailingPE),
      pbRatio: safeNum(ks.priceToBook),
      psRatio: safeNum(sd.priceToSalesTrailing12Months),
      pegRatio: safeNum(ks.pegRatio),
      evToEbitda: safeNum(ks.enterpriseToEbitda),
      roe: safeNum(fd.returnOnEquity),
      roa: safeNum(fd.returnOnAssets),
      debtToEquity: safeNum(fd.debtToEquity),
      currentRatio: safeNum(fd.currentRatio),
      freeCashFlow: safeNum(fd.freeCashflow),
      revenueGrowth: safeNum(fd.revenueGrowth),
      earningsGrowth: safeNum(fd.earningsGrowth),
      dividendYield: safeNum(sd.dividendYield),
      sector: ap.sector || null,
      industry: ap.industry || null,
    };

    // Check for existing record today
    const existing = await db.fundamental.findFirst({
      where: { ticker, dateFetched: todayDate },
    });

    if (existing) {
      await db.fundamental.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await db.fundamental.create({
        data: { ticker, dateFetched: todayDate, ...data },
      });
    }

    console.log(`Upserted fundamentals for ${ticker}`);
    return data;
  } catch (error) {
    console.error(`Error fetching fundamentals for ${ticker}:`, error);
    throw error;
  }
}

export async function bulkFetchPrices(
  tickers: string[],
  period: string = '1y',
  prisma?: PrismaClient,
): Promise<Record<string, number>> {
  const db = prisma || getPrisma();
  const results: Record<string, number> = {};

  for (const ticker of tickers) {
    try {
      results[ticker] = await fetchPrices(ticker, period, db);
    } catch (error) {
      console.error(`Skipping ${ticker} due to error:`, error);
      results[ticker] = 0;
    }
  }

  return results;
}
