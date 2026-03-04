import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses default values when env vars are empty', async () => {
    // Clear all app-specific env vars
    delete process.env.APP_NAME;
    delete process.env.PORT;
    delete process.env.DATABASE_URL;
    delete process.env.FRED_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_MODEL_SCREENING;
    delete process.env.AI_MODEL_DEEP;
    delete process.env.AI_CACHE_HOURS;
    delete process.env.MARKET_CLOSE_HOUR_UTC;
    delete process.env.SCHEDULER_ENABLED;
    delete process.env.MAX_POSITION_PCT;
    delete process.env.KELLY_FRACTION;
    delete process.env.INITIAL_CASH_BALANCE;
    delete process.env.APP_API_KEY;
    delete process.env.DB_ENCRYPTION_KEY;
    delete process.env.DEFAULT_TICKERS;
    delete process.env.DEBUG;

    const { getSettings } = await import('../config');
    const settings = getSettings();

    expect(settings.APP_NAME).toBe('Market Intelligence API');
    expect(settings.PORT).toBe(8000);
    expect(settings.AI_CACHE_HOURS).toBe(24);
    expect(settings.KELLY_FRACTION).toBe(0.5);
    expect(settings.MAX_POSITION_PCT).toBe(0.1);
    expect(settings.DEFAULT_TICKERS).toContain('AAPL');
    expect(settings.DEFAULT_TICKERS).toContain('MSFT');
    expect(settings.DEFAULT_TICKERS.length).toBe(15);
  });

  it('parses custom env values', async () => {
    process.env.APP_NAME = 'Test App';
    process.env.PORT = '3000';
    process.env.AI_CACHE_HOURS = '48';
    process.env.KELLY_FRACTION = '0.25';
    process.env.SCHEDULER_ENABLED = 'false';
    process.env.DEFAULT_TICKERS = 'AAPL,GOOGL';

    const { getSettings } = await import('../config');
    const settings = getSettings();

    expect(settings.APP_NAME).toBe('Test App');
    expect(settings.PORT).toBe(3000);
    expect(settings.AI_CACHE_HOURS).toBe(48);
    expect(settings.KELLY_FRACTION).toBe(0.25);
    expect(settings.SCHEDULER_ENABLED).toBe(false);
    expect(settings.DEFAULT_TICKERS).toEqual(['AAPL', 'GOOGL']);
  });

  it('parses DEFAULT_TICKERS with spaces', async () => {
    process.env.DEFAULT_TICKERS = ' AAPL , MSFT , GOOGL ';
    const { getSettings } = await import('../config');
    const settings = getSettings();
    expect(settings.DEFAULT_TICKERS).toEqual(['AAPL', 'MSFT', 'GOOGL']);
  });

  it('parses boolean DEBUG correctly', async () => {
    process.env.DEBUG = 'true';
    const { getSettings } = await import('../config');
    const settings = getSettings();
    expect(settings.DEBUG).toBe(true);
  });

  it('DEBUG false when not "true"', async () => {
    process.env.DEBUG = 'false';
    const { getSettings } = await import('../config');
    const settings = getSettings();
    expect(settings.DEBUG).toBe(false);
  });
});
