// Market Data
export interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
}

export interface FundamentalData {
  ticker: string;
  date_fetched: string;
  market_cap: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  peg_ratio: number | null;
  ev_to_ebitda: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  free_cash_flow: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  dividend_yield: number | null;
  sector: string | null;
  industry: string | null;
}

// Technical Analysis
export interface TechnicalScores {
  composite: number | null;
  trend: number | null;
  momentum: number | null;
  volatility: number | null;
  volume: number | null;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  adx: number | null;
  stochastic_k: number | null;
  stochastic_d: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  atr: number | null;
  obv: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_12: number | null;
  ema_26: number | null;
}

export interface TechnicalAnalysis {
  ticker: string;
  date: string;
  timeframe: string;
  scores: TechnicalScores;
  indicators: TechnicalIndicators;
}

// Regime
export interface RegimeData {
  date: string;
  regime_label: "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "CRISIS";
  confidence: number | null;
  vix_regime: string | null;
  yield_curve_state: string | null;
  breadth_score: number | null;
  hmm_state: number | null;
}

// Portfolio
export interface Position {
  id: number;
  ticker: string;
  entry_date: string;
  entry_price: number;
  quantity: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  sector: string | null;
  position_type: string;
  notes: string | null;
}

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  position_count: number;
  sector_allocation: Record<string, number>;
}

export interface RiskMetrics {
  var_95: number | null;
  var_99: number | null;
  cvar_95: number | null;
  max_drawdown: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  beta: number | null;
  sector_concentration: number | null;
}

// AI Analysis
export interface ScenarioCase {
  probability: number;
  target: string;
  thesis: string;
}

export interface AIAnalysisResult {
  bull_case: ScenarioCase;
  base_case: ScenarioCase;
  bear_case: ScenarioCase;
  risk_factors: string[];
  max_drawdown_estimate: string;
  position_size_pct: number;
  confidence: number;
  timeframe: string;
}

export interface ScreeningResult {
  ticker: string;
  action: "BUY" | "HOLD" | "SELL" | "WATCH";
  conviction: number;
  one_liner: string;
}

export interface MarketOutlook {
  regime_assessment: string;
  sector_rotation: string[];
  risk_level: string;
  key_themes: string[];
  outlook_text: string;
}

// Transactions
export interface Transaction {
  id: number;
  ticker: string;
  transaction_type: "BUY" | "SELL" | "DIVIDEND";
  date: string;
  price: number;
  quantity: number;
  total_amount: number;
  fees: number;
  position_id: number | null;
  notes: string | null;
  created_at: string | null;
}

// Monte Carlo
export interface MonteCarloResult {
  current_value: number;
  horizon_days: number;
  num_paths: number;
  percentiles: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  terminal_distribution: {
    mean: number;
    median: number;
    std: number;
    prob_loss: number;
    worst_case_5pct: number;
    best_case_95pct: number;
    mean_return_pct: number;
  };
}

// Stress Test
export interface StressTestScenario {
  label: string;
  spy_drop_pct: number;
  portfolio_impact_pct: number;
  portfolio_impact_usd: number;
  worst_hit_positions: { ticker: string; impact_usd: number }[];
}

// Portfolio Health
export interface PortfolioHealth {
  total: number;
  diversification: number;
  risk: number;
  performance: number;
  balance: number;
  details: {
    position_count: number;
    sector_hhi: number;
    top_3_pct: number;
    sharpe: number | null;
    max_drawdown: number | null;
    twr_annualized: number;
    beta: number | null;
    cluster_count: number;
  };
}

// Currency Exposure
export interface CurrencyExposureData {
  usd_inr_rate: number;
  portfolio_value_usd: number;
  portfolio_value_inr: number;
  fx_volatility_pct: number;
  inr_sensitivity: {
    inr_move_pct: number;
    adjusted_rate: number;
    portfolio_value_inr: number;
    change_inr: number;
  }[];
}

// Concentration
export interface ConcentrationData {
  top_3_pct: number;
  top_5_pct: number;
  largest_position: { ticker: string; weight_pct: number } | null;
  hhi: number;
  position_weights: { ticker: string; weight_pct: number }[];
}

// Correlation Clusters
export interface CorrelationClusters {
  clusters: { cluster_id: number; tickers: string[] }[];
  high_correlation_pairs: { ticker_1: string; ticker_2: string; correlation: number }[];
}

// TWR
export interface TWRResult {
  twr_total: number;
  twr_annualized: number;
  days: number;
}

// Cash Balance
export interface CashBalanceData {
  balance_usd: number;
  change_amount: number;
  change_reason: string;
}

// News
export interface NewsArticle {
  date: string;
  headline: string;
  source: string;
  sentiment_score: number | null;
  summary: string | null;
}

// Macro
export interface MacroIndicator {
  value: number;
  date: string;
}

export interface MacroDashboard {
  current: Record<string, MacroIndicator>;
  history: Record<string, { date: string; value: number }[]>;
  yield_spread: number | null;
  yield_curve_inverted: boolean;
}
