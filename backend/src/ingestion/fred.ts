/**
 * FRED (Federal Reserve Economic Data) ingestion via direct REST API.
 * Fetches macro-economic indicators: GDP, CPI, unemployment, fed funds rate,
 * treasury yields (10Y, 2Y), and VIX.
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import { startOfDay } from '../utils/format';

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

// FRED series mapping: friendly name -> FRED series ID
const FRED_SERIES: Record<string, string> = {
  GDP: 'GDP',
  CPI: 'CPIAUCSL',
  unemployment_rate: 'UNRATE',
  fed_funds_rate: 'FEDFUNDS',
  '10y_yield': 'DGS10',
  '2y_yield': 'DGS2',
  VIX: 'VIXCLS',
};

export async function fetchSingleIndicator(
  indicatorName: string,
  seriesId: string,
  prisma?: PrismaClient,
  limit: number = 252,
): Promise<number> {
  const db = prisma || getPrisma();
  const settings = getSettings();

  if (!settings.FRED_API_KEY) {
    throw new Error('FRED API key is not configured. Set FRED_API_KEY in your .env file.');
  }

  console.log(`Fetching FRED series ${seriesId} (${indicatorName})`);

  try {
    const response = await axios.get(FRED_BASE_URL, {
      params: {
        series_id: seriesId,
        api_key: settings.FRED_API_KEY,
        file_type: 'json',
        sort_order: 'desc',
        limit,
      },
    });

    const observations = response.data?.observations;
    if (!observations || observations.length === 0) {
      console.warn(`No data returned for FRED series ${seriesId}`);
      return 0;
    }

    let count = 0;
    for (const obs of observations) {
      if (obs.value === '.' || obs.value === undefined) continue;

      const value = parseFloat(obs.value);
      if (isNaN(value)) continue;

      const obsDate = startOfDay(new Date(obs.date));

      await db.macroIndicator.upsert({
        where: {
          uq_indicator_date: { indicatorName, date: obsDate },
        },
        update: { value: Math.round(value * 1e6) / 1e6 },
        create: {
          indicatorName,
          date: obsDate,
          value: Math.round(value * 1e6) / 1e6,
        },
      });
      count++;
    }

    console.log(`Upserted ${count} rows for ${indicatorName}`);
    return count;
  } catch (error) {
    console.error(`Error fetching FRED series ${seriesId}:`, error);
    throw error;
  }
}

export async function fetchMacroIndicators(
  prisma?: PrismaClient,
): Promise<Record<string, number>> {
  const db = prisma || getPrisma();
  const results: Record<string, number> = {};

  for (const [name, seriesId] of Object.entries(FRED_SERIES)) {
    try {
      results[name] = await fetchSingleIndicator(name, seriesId, db);
    } catch (error) {
      console.error(`Skipping indicator ${name} due to error:`, error);
      results[name] = 0;
    }
  }

  return results;
}
