/**
 * Zod schemas for AI output validation (replaces Pydantic models).
 */

import { z } from 'zod';

export const ScenarioCaseSchema = z.object({
  probability: z.number().min(0).max(1),
  target: z.string(),
  thesis: z.string(),
});

export type ScenarioCase = z.infer<typeof ScenarioCaseSchema>;

export const AIAnalysisResultSchema = z
  .object({
    bull_case: ScenarioCaseSchema,
    base_case: ScenarioCaseSchema,
    bear_case: ScenarioCaseSchema,
    risk_factors: z.array(z.string()),
    max_drawdown_estimate: z.string(),
    position_size_pct: z.number(),
    confidence: z.number().min(0).max(1),
    timeframe: z.string(),
  })
  .refine(
    (data) => {
      const total =
        data.bull_case.probability +
        data.base_case.probability +
        data.bear_case.probability;
      return Math.abs(total - 1.0) <= 0.05;
    },
    {
      message:
        'bull + base + bear probabilities must sum to ~1.0 (within 0.05 tolerance)',
    },
  );

export type AIAnalysisResult = z.infer<typeof AIAnalysisResultSchema>;

export const ScreeningResultSchema = z.object({
  ticker: z.string(),
  action: z.enum(['BUY', 'HOLD', 'SELL', 'WATCH']),
  conviction: z.number().min(0).max(1),
  one_liner: z.string(),
});

export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;

export const MarketOutlookSchema = z.object({
  regime_assessment: z.string(),
  sector_rotation: z.array(z.string()),
  risk_level: z.string(),
  key_themes: z.array(z.string()),
  outlook_text: z.string(),
});

export type MarketOutlook = z.infer<typeof MarketOutlookSchema>;

export const PortfolioReviewSchema = z.object({
  investment_stage: z.string(),
  portfolio_grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  overall_assessment: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  risk_alerts: z.array(z.string()),
});

export type PortfolioReview = z.infer<typeof PortfolioReviewSchema>;
