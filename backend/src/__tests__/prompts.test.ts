import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt, buildScreeningPrompt, buildMarketOutlookPrompt } from '../ai/prompts';

describe('buildAnalysisPrompt', () => {
  it('returns [systemPrompt, userPrompt] tuple', () => {
    const [system, user] = buildAnalysisPrompt(
      'AAPL',
      { rsi: 55 },
      { pe_ratio: 25 },
      { regime_label: 'NEUTRAL' },
      { total_value: 50000 },
    );
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });

  it('system prompt contains ticker', () => {
    const [system] = buildAnalysisPrompt('TSLA', {}, {}, {}, {});
    expect(system).toContain('TSLA');
  });

  it('user prompt contains all data sections', () => {
    const [, user] = buildAnalysisPrompt(
      'AAPL',
      { rsi: 55 },
      { pe_ratio: 25 },
      { regime_label: 'NEUTRAL' },
      { total_value: 50000 },
    );
    expect(user).toContain('Technical Indicators');
    expect(user).toContain('Fundamental Data');
    expect(user).toContain('Market Regime');
    expect(user).toContain('Portfolio Exposure');
    expect(user).toContain('rsi');
    expect(user).toContain('pe_ratio');
  });

  it('user prompt includes schema', () => {
    const [, user] = buildAnalysisPrompt('AAPL', {}, {}, {}, {});
    expect(user).toContain('bull_case');
    expect(user).toContain('bear_case');
    expect(user).toContain('confidence');
  });

  it('instructs to return raw JSON', () => {
    const [, user] = buildAnalysisPrompt('AAPL', {}, {}, {}, {});
    expect(user).toContain('Return ONLY the raw JSON object');
  });
});

describe('buildScreeningPrompt', () => {
  it('returns [systemPrompt, userPrompt] tuple', () => {
    const [system, user] = buildScreeningPrompt([{ ticker: 'AAPL', score: 80 }]);
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });

  it('system prompt mentions screening', () => {
    const [system] = buildScreeningPrompt([]);
    expect(system.toLowerCase()).toContain('screening');
  });

  it('user prompt includes tickers data', () => {
    const [, user] = buildScreeningPrompt([
      { ticker: 'AAPL', score: 80 },
      { ticker: 'MSFT', score: 75 },
    ]);
    expect(user).toContain('AAPL');
    expect(user).toContain('MSFT');
  });

  it('requests JSON array output', () => {
    const [, user] = buildScreeningPrompt([]);
    expect(user).toContain('JSON **array**');
  });
});

describe('buildMarketOutlookPrompt', () => {
  it('returns [systemPrompt, userPrompt] tuple', () => {
    const [system, user] = buildMarketOutlookPrompt(
      { regime_label: 'NEUTRAL' },
      { GDP: 2.5 },
      { XLK: 75 },
    );
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });

  it('user prompt includes regime, macro, and sector data', () => {
    const [, user] = buildMarketOutlookPrompt(
      { regime_label: 'RISK_ON' },
      { CPI: 3.2, VIX: 15 },
      { XLK: 80, XLF: 60 },
    );
    expect(user).toContain('RISK_ON');
    expect(user).toContain('CPI');
    expect(user).toContain('VIX');
    expect(user).toContain('XLK');
  });

  it('system prompt mentions macro strategist', () => {
    const [system] = buildMarketOutlookPrompt({}, {}, {});
    expect(system.toLowerCase()).toContain('macro strategist');
  });
});
