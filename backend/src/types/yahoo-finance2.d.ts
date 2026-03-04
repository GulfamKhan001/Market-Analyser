declare module 'yahoo-finance2' {
  interface HistoricalOptions {
    period1: Date | string | number;
    period2?: Date | string | number;
    interval?: '1d' | '1wk' | '1mo';
  }

  interface HistoricalRow {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    adjClose?: number;
    volume: number;
  }

  interface QuoteResult {
    regularMarketPrice?: number;
    shortName?: string;
    [key: string]: any;
  }

  interface QuoteSummaryResult {
    summaryDetail?: Record<string, any>;
    defaultKeyStatistics?: Record<string, any>;
    financialData?: Record<string, any>;
    assetProfile?: Record<string, any>;
    incomeStatementHistory?: Record<string, any>;
    [key: string]: any;
  }

  interface YahooFinanceOptions {
    suppressNotices?: string[];
  }

  class YahooFinance {
    constructor(options?: YahooFinanceOptions);
    historical(symbol: string, options: HistoricalOptions): Promise<HistoricalRow[]>;
    quote(symbol: string): Promise<QuoteResult>;
    quoteSummary(symbol: string, options?: { modules?: string[] }): Promise<QuoteSummaryResult>;
  }

  export default YahooFinance;
}
