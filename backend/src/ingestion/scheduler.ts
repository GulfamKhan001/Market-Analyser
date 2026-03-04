/**
 * node-cron based task scheduler for periodic data ingestion.
 * Runs a daily refresh job after US market close (21:00 UTC / 4 PM ET).
 */

import cron from 'node-cron';
import { getSettings } from '../config';
import { getPrisma } from '../db/client';
import { bulkFetchPrices, fetchFundamentals, fetchPrices } from './yahoo';
import { fetchMacroIndicators } from './fred';
import { bulkFetchNews } from './finnhub';

let _task: cron.ScheduledTask | null = null;

async function dailyDataRefresh(): Promise<void> {
  console.log(`Starting daily data refresh at ${new Date().toISOString()}`);
  const prisma = getPrisma();
  const settings = getSettings();

  try {
    // 1. Prices
    const tickers = settings.DEFAULT_TICKERS;
    console.log(`Fetching prices for ${tickers.length} tickers`);
    try {
      const priceResults = await bulkFetchPrices(tickers, '5d', prisma);
      console.log('Price fetch results:', priceResults);
    } catch (e) {
      console.error('Price fetch failed:', e);
    }

    // 2. Fundamentals
    console.log(`Fetching fundamentals for ${tickers.length} tickers`);
    for (const ticker of tickers) {
      try {
        await fetchFundamentals(ticker, prisma);
      } catch (e) {
        console.error(`Fundamentals fetch failed for ${ticker}:`, e);
      }
    }

    // 3. Macro indicators
    console.log('Fetching macro indicators from FRED');
    try {
      const macroResults = await fetchMacroIndicators(prisma);
      console.log('Macro fetch results:', macroResults);
    } catch (e) {
      console.error('Macro indicator fetch failed:', e);
    }

    // 4. SPY for regime detection + beta
    console.log('Fetching SPY prices for regime/beta');
    try {
      await fetchPrices('SPY', '5d', prisma);
    } catch (e) {
      console.error('SPY fetch failed:', e);
    }

    // 5. News for top tickers
    const topTickers = tickers.slice(0, 10);
    console.log(`Fetching news for top ${topTickers.length} tickers`);
    try {
      const newsResults = await bulkFetchNews(topTickers, prisma, 1);
      console.log('News fetch results:', newsResults);
    } catch (e) {
      console.error('News fetch failed:', e);
    }

    // 6. Regime detection
    console.log('Running regime detection');
    try {
      const { detectRegime } = await import('../analysis/regime');
      const regime = await detectRegime(prisma);
      console.log('Regime:', regime.regime_label);
    } catch (e) {
      console.error('Regime detection failed:', e);
    }

    console.log(`Daily data refresh completed at ${new Date().toISOString()}`);
  } catch (e) {
    console.error('Daily data refresh encountered a fatal error:', e);
  }
}

export function startScheduler(): void {
  const settings = getSettings();

  if (_task) {
    console.warn('Scheduler is already running');
    return;
  }

  if (!settings.SCHEDULER_ENABLED) {
    console.log('Scheduler is disabled via settings (SCHEDULER_ENABLED=false)');
    return;
  }

  const hour = settings.MARKET_CLOSE_HOUR_UTC;
  const cronExpr = `0 ${hour} * * *`;

  _task = cron.schedule(cronExpr, () => {
    dailyDataRefresh().catch(e => console.error('Scheduler job failed:', e));
  }, { timezone: 'UTC' });

  console.log(`Scheduled daily_data_refresh at ${String(hour).padStart(2, '0')}:00 UTC`);
}

export function stopScheduler(): void {
  if (_task) {
    _task.stop();
    _task = null;
    console.log('Scheduler stopped');
  }
}

export async function triggerRefreshNow(): Promise<void> {
  console.log('Manually triggering daily data refresh');
  await dailyDataRefresh();
}
