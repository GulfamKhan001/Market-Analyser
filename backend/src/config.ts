import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // App
  APP_NAME: z.string().default('Market Intelligence API'),
  DEBUG: z.string().transform(v => v === 'true').default('true'),
  PORT: z.string().transform(Number).default('8000'),

  // Database
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/market_analyser'),

  // API Keys
  FRED_API_KEY: z.string().default(''),
  FINNHUB_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),

  // AI Model Config
  AI_MODEL_SCREENING: z.string().default('claude-haiku-4-5-20251001'),
  AI_MODEL_DEEP: z.string().default('claude-sonnet-4-6'),
  AI_CACHE_HOURS: z.string().transform(Number).default('24'),

  // Scheduler
  MARKET_CLOSE_HOUR_UTC: z.string().transform(Number).default('21'),
  SCHEDULER_ENABLED: z.string().transform(v => v === 'true').default('true'),

  // Portfolio Defaults
  MAX_POSITION_PCT: z.string().transform(Number).default('0.10'),
  KELLY_FRACTION: z.string().transform(Number).default('0.5'),
  INITIAL_CASH_BALANCE: z.string().transform(Number).default('0.0'),

  // Auth
  APP_API_KEY: z.string().default(''),

  // Encryption
  DB_ENCRYPTION_KEY: z.string().default(''),

  // Watchlist
  DEFAULT_TICKERS: z
    .string()
    .default('AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,JPM,V,JNJ,UNH,XOM,PG,HD,MA')
    .transform(s => s.split(',').map(t => t.trim()).filter(Boolean)),
});

export type Settings = z.infer<typeof envSchema>;

let _settings: Settings | null = null;

export function getSettings(): Settings {
  if (!_settings) {
    _settings = envSchema.parse(process.env);
  }
  return _settings;
}
