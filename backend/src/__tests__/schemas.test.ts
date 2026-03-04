import { describe, it, expect } from 'vitest';
import {
  ScenarioCaseSchema,
  AIAnalysisResultSchema,
  ScreeningResultSchema,
  MarketOutlookSchema,
} from '../ai/schemas';

describe('ScenarioCaseSchema', () => {
  it('accepts valid scenario', () => {
    const result = ScenarioCaseSchema.parse({
      probability: 0.5,
      target: '$200',
      thesis: 'Strong growth',
    });
    expect(result.probability).toBe(0.5);
  });

  it('rejects probability > 1', () => {
    expect(() =>
      ScenarioCaseSchema.parse({ probability: 1.5, target: 'x', thesis: 'y' }),
    ).toThrow();
  });

  it('rejects probability < 0', () => {
    expect(() =>
      ScenarioCaseSchema.parse({ probability: -0.1, target: 'x', thesis: 'y' }),
    ).toThrow();
  });

  it('accepts boundary values 0 and 1', () => {
    expect(ScenarioCaseSchema.parse({ probability: 0, target: 'x', thesis: 'y' }).probability).toBe(0);
    expect(ScenarioCaseSchema.parse({ probability: 1, target: 'x', thesis: 'y' }).probability).toBe(1);
  });
});

describe('AIAnalysisResultSchema', () => {
  const validResult = {
    bull_case: { probability: 0.3, target: '$200', thesis: 'Bull thesis' },
    base_case: { probability: 0.5, target: '$180', thesis: 'Base thesis' },
    bear_case: { probability: 0.2, target: '$150', thesis: 'Bear thesis' },
    risk_factors: ['Inflation', 'Recession'],
    max_drawdown_estimate: '-15%',
    position_size_pct: 5.0,
    confidence: 0.75,
    timeframe: '12 months',
  };

  it('accepts valid analysis result', () => {
    const result = AIAnalysisResultSchema.parse(validResult);
    expect(result.confidence).toBe(0.75);
  });

  it('rejects when probabilities do not sum to ~1.0', () => {
    expect(() =>
      AIAnalysisResultSchema.parse({
        ...validResult,
        bull_case: { probability: 0.1, target: '$200', thesis: 'x' },
        base_case: { probability: 0.1, target: '$180', thesis: 'y' },
        bear_case: { probability: 0.1, target: '$150', thesis: 'z' },
      }),
    ).toThrow(/sum to ~1\.0/);
  });

  it('accepts probabilities within 0.05 tolerance', () => {
    const result = AIAnalysisResultSchema.parse({
      ...validResult,
      bull_case: { probability: 0.33, target: '$200', thesis: 'x' },
      base_case: { probability: 0.34, target: '$180', thesis: 'y' },
      bear_case: { probability: 0.30, target: '$150', thesis: 'z' },
    });
    expect(result).toBeDefined();
  });

  it('rejects confidence > 1', () => {
    expect(() =>
      AIAnalysisResultSchema.parse({ ...validResult, confidence: 1.5 }),
    ).toThrow();
  });

  it('requires all fields', () => {
    expect(() => AIAnalysisResultSchema.parse({})).toThrow();
  });
});

describe('ScreeningResultSchema', () => {
  it('accepts valid actions', () => {
    for (const action of ['BUY', 'HOLD', 'SELL', 'WATCH']) {
      const result = ScreeningResultSchema.parse({
        ticker: 'AAPL',
        action,
        conviction: 0.8,
        one_liner: 'Strong momentum',
      });
      expect(result.action).toBe(action);
    }
  });

  it('rejects invalid action', () => {
    expect(() =>
      ScreeningResultSchema.parse({
        ticker: 'AAPL',
        action: 'YOLO',
        conviction: 0.5,
        one_liner: 'x',
      }),
    ).toThrow();
  });

  it('rejects conviction out of range', () => {
    expect(() =>
      ScreeningResultSchema.parse({
        ticker: 'AAPL',
        action: 'BUY',
        conviction: 1.5,
        one_liner: 'x',
      }),
    ).toThrow();
  });
});

describe('MarketOutlookSchema', () => {
  it('accepts valid outlook', () => {
    const result = MarketOutlookSchema.parse({
      regime_assessment: 'Risk On',
      sector_rotation: ['Technology', 'Healthcare'],
      risk_level: 'Moderate',
      key_themes: ['AI growth', 'Rate cuts'],
      outlook_text: 'Market looks favorable.',
    });
    expect(result.sector_rotation.length).toBe(2);
  });

  it('rejects missing fields', () => {
    expect(() =>
      MarketOutlookSchema.parse({
        regime_assessment: 'Risk On',
      }),
    ).toThrow();
  });

  it('accepts empty arrays', () => {
    const result = MarketOutlookSchema.parse({
      regime_assessment: 'Neutral',
      sector_rotation: [],
      risk_level: 'Low',
      key_themes: [],
      outlook_text: 'No clear direction.',
    });
    expect(result.sector_rotation).toEqual([]);
  });
});
