/**
 * Finnhub news and sentiment ingestion via direct REST API.
 * Fetches company news headlines and computes keyword-based sentiment scores.
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import { toDateString } from '../utils/format';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

const POSITIVE_KEYWORDS = new Set([
  'upgrade', 'beat', 'beats', 'surge', 'surges', 'rally', 'rallies',
  'gain', 'gains', 'profit', 'record', 'bullish', 'strong', 'growth',
  'outperform', 'buy', 'positive', 'boost', 'boosts', 'rises', 'rise',
  'soar', 'soars', 'high', 'breakout', 'upside', 'optimism', 'recovery',
  'expand', 'expands', 'exceeded', 'exceeds', 'above', 'tops',
]);

const NEGATIVE_KEYWORDS = new Set([
  'downgrade', 'miss', 'misses', 'drop', 'drops', 'fall', 'falls',
  'loss', 'losses', 'decline', 'declines', 'bearish', 'weak', 'cut',
  'cuts', 'sell', 'negative', 'crash', 'crashes', 'plunge', 'plunges',
  'low', 'risk', 'warning', 'warns', 'layoff', 'layoffs', 'below',
  'bankruptcy', 'default', 'investigation', 'fraud', 'recession',
  'underperform', 'downturn', 'slump', 'slumps',
]);

export function computeHeadlineSentiment(headline: string): number {
  if (!headline) return 0;

  const words = new Set(headline.toLowerCase().split(/\s+/));
  let posCount = 0;
  let negCount = 0;

  for (const word of words) {
    if (POSITIVE_KEYWORDS.has(word)) posCount++;
    if (NEGATIVE_KEYWORDS.has(word)) negCount++;
  }

  const total = posCount + negCount;
  if (total === 0) return 0;

  return Math.round(((posCount - negCount) / total) * 10000) / 10000;
}

export async function fetchNews(
  ticker: string,
  prisma?: PrismaClient,
  daysBack: number = 7,
): Promise<number> {
  const db = prisma || getPrisma();
  const settings = getSettings();

  if (!settings.FINNHUB_API_KEY) {
    throw new Error('Finnhub API key is not configured. Set FINNHUB_API_KEY in your .env file.');
  }

  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - daysBack * 24 * 60 * 60 * 1000);

  console.log(`Fetching Finnhub news for ${ticker} from ${toDateString(dateFrom)} to ${toDateString(dateTo)}`);

  try {
    const response = await axios.get(`${FINNHUB_BASE}/company-news`, {
      params: {
        symbol: ticker,
        from: toDateString(dateFrom),
        to: toDateString(dateTo),
        token: settings.FINNHUB_API_KEY,
      },
    });

    const articles = response.data;
    if (!articles || articles.length === 0) {
      console.warn(`No news articles returned for ${ticker}`);
      return 0;
    }

    let count = 0;
    for (const article of articles) {
      const headline = (article.headline || '').trim();
      if (!headline) continue;

      const pubDate = new Date(article.datetime * 1000);
      const sentiment = computeHeadlineSentiment(headline);

      // Check for existing by headline + date
      const existing = await db.newsSentiment.findFirst({
        where: { ticker, headline, date: pubDate },
      });

      if (existing) {
        await db.newsSentiment.update({
          where: { id: existing.id },
          data: {
            sentimentScore: sentiment,
            source: article.source || null,
            url: article.url || null,
            summary: article.summary ? article.summary.slice(0, 2000) : null,
          },
        });
      } else {
        await db.newsSentiment.create({
          data: {
            ticker,
            date: pubDate,
            headline,
            source: article.source || null,
            url: article.url || null,
            sentimentScore: sentiment,
            relevanceScore: article.relevance || 1.0,
            summary: article.summary ? article.summary.slice(0, 2000) : null,
          },
        });
      }
      count++;
    }

    console.log(`Upserted ${count} news articles for ${ticker}`);
    return count;
  } catch (error) {
    console.error(`Error fetching news for ${ticker}:`, error);
    throw error;
  }
}

export async function bulkFetchNews(
  tickers: string[],
  prisma?: PrismaClient,
  daysBack: number = 7,
): Promise<Record<string, number>> {
  const db = prisma || getPrisma();
  const results: Record<string, number> = {};

  for (const ticker of tickers) {
    try {
      results[ticker] = await fetchNews(ticker, db, daysBack);
    } catch (error) {
      console.error(`Skipping news for ${ticker} due to error:`, error);
      results[ticker] = 0;
    }
  }

  return results;
}
