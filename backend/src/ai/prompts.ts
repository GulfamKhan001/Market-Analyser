/**
 * Prompt templates for Claude AI analysis.
 */

const ANALYSIS_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    bull_case: { type: 'object', properties: { probability: { type: 'number' }, target: { type: 'string' }, thesis: { type: 'string' } }, required: ['probability', 'target', 'thesis'] },
    base_case: { type: 'object', properties: { probability: { type: 'number' }, target: { type: 'string' }, thesis: { type: 'string' } }, required: ['probability', 'target', 'thesis'] },
    bear_case: { type: 'object', properties: { probability: { type: 'number' }, target: { type: 'string' }, thesis: { type: 'string' } }, required: ['probability', 'target', 'thesis'] },
    risk_factors: { type: 'array', items: { type: 'string' } },
    max_drawdown_estimate: { type: 'string' },
    position_size_pct: { type: 'number' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    timeframe: { type: 'string' },
  },
  required: ['bull_case', 'base_case', 'bear_case', 'risk_factors', 'max_drawdown_estimate', 'position_size_pct', 'confidence', 'timeframe'],
}, null, 2);

const SCREENING_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    ticker: { type: 'string' },
    action: { type: 'string', enum: ['BUY', 'HOLD', 'SELL', 'WATCH'] },
    conviction: { type: 'number', minimum: 0, maximum: 1 },
    one_liner: { type: 'string' },
  },
  required: ['ticker', 'action', 'conviction', 'one_liner'],
}, null, 2);

const OUTLOOK_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    regime_assessment: { type: 'string' },
    sector_rotation: { type: 'array', items: { type: 'string' } },
    risk_level: { type: 'string' },
    key_themes: { type: 'array', items: { type: 'string' } },
    outlook_text: { type: 'string' },
  },
  required: ['regime_assessment', 'sector_rotation', 'risk_level', 'key_themes', 'outlook_text'],
}, null, 2);

export function buildPortfolioQueryPrompt(
  query: string,
  positions: Record<string, any>[],
  summary: Record<string, any>,
  riskMetrics: Record<string, any>,
  healthScore: Record<string, any>,
  concentration: Record<string, any>,
  regimeData: Record<string, any>,
): [string, string] {
  const systemPrompt =
    'You are a portfolio analyst advising an India-based investor in US equities. ' +
    'Prioritize capital preservation and risk-adjusted returns over S&P 500 long-term. ' +
    'Base reasoning ONLY on provided portfolio data. No hype language. No guaranteed returns. ' +
    'Answer the user\'s question concisely and directly. Use markdown formatting for readability. ' +
    'IMPORTANT: Only answer questions about the user\'s portfolio — positions, risk, allocation, ' +
    'performance, sector exposure, rebalancing. If the question is unrelated to their portfolio, ' +
    'politely redirect them to ask a portfolio-related question.';

  const userPrompt =
    '## Portfolio Positions\n' +
    `\`\`\`json\n${JSON.stringify(positions, null, 2)}\n\`\`\`\n\n` +
    '## Portfolio Summary\n' +
    `\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\n` +
    '## Risk Metrics\n' +
    `\`\`\`json\n${JSON.stringify(riskMetrics, null, 2)}\n\`\`\`\n\n` +
    '## Health Score\n' +
    `\`\`\`json\n${JSON.stringify(healthScore, null, 2)}\n\`\`\`\n\n` +
    '## Concentration\n' +
    `\`\`\`json\n${JSON.stringify(concentration, null, 2)}\n\`\`\`\n\n` +
    '## Market Regime\n' +
    `\`\`\`json\n${JSON.stringify(regimeData, null, 2)}\n\`\`\`\n\n` +
    '---\n\n' +
    `## User Question\n${query}\n\n` +
    'Answer the question above based ONLY on the provided portfolio data. ' +
    'Keep the answer focused, actionable, and under 300 words.';

  return [systemPrompt, userPrompt];
}

export function buildAnalysisPrompt(
  ticker: string,
  technicalData: Record<string, any>,
  fundamentalData: Record<string, any>,
  regimeData: Record<string, any>,
  portfolioExposure: Record<string, any>,
): [string, string] {
  const systemPrompt =
    `You are a quantitative analyst. Given the following deterministic ` +
    `analytics for ${ticker}, provide probability-weighted scenario ` +
    `analysis. Never guarantee returns. Base reasoning ONLY on provided ` +
    `data. Output valid JSON matching the schema.`;

  const userPrompt =
    `## Ticker: ${ticker}\n\n` +
    `### Technical Indicators\n` +
    `\`\`\`json\n${JSON.stringify(technicalData, null, 2)}\n\`\`\`\n\n` +
    `### Fundamental Data\n` +
    `\`\`\`json\n${JSON.stringify(fundamentalData, null, 2)}\n\`\`\`\n\n` +
    `### Market Regime\n` +
    `\`\`\`json\n${JSON.stringify(regimeData, null, 2)}\n\`\`\`\n\n` +
    `### Current Portfolio Exposure\n` +
    `\`\`\`json\n${JSON.stringify(portfolioExposure, null, 2)}\n\`\`\`\n\n` +
    `---\n\n` +
    `Produce a JSON object that matches this schema exactly ` +
    `(no additional keys, no markdown fences):\n\n` +
    `\`\`\`\n${ANALYSIS_SCHEMA}\n\`\`\`\n\n` +
    `Return ONLY the raw JSON object.`;

  return [systemPrompt, userPrompt];
}

export function buildScreeningPrompt(
  tickersData: Record<string, any>[],
): [string, string] {
  const systemPrompt =
    'You are a quantitative screening engine. For each ticker provided, ' +
    'assign an action (BUY / HOLD / SELL / WATCH), a conviction score ' +
    '(0-1), and a one-line rationale. Base reasoning ONLY on provided ' +
    'data. Output valid JSON matching the schema.';

  const userPrompt =
    '## Tickers for Screening\n\n' +
    `\`\`\`json\n${JSON.stringify(tickersData, null, 2)}\n\`\`\`\n\n` +
    '---\n\n' +
    'Produce a JSON **array** where each element matches this schema ' +
    '(no additional keys, no markdown fences):\n\n' +
    `\`\`\`\n${SCREENING_SCHEMA}\n\`\`\`\n\n` +
    'Return ONLY the raw JSON array.';

  return [systemPrompt, userPrompt];
}

const PORTFOLIO_REVIEW_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    investment_stage: { type: 'string', description: 'e.g. Early Accumulation, Growth, Mature, Over-concentrated' },
    portfolio_grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
    overall_assessment: { type: 'string', description: '2-4 sentence summary' },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    risk_alerts: { type: 'array', items: { type: 'string' }, description: 'Urgent risks only, empty if none' },
  },
  required: ['investment_stage', 'portfolio_grade', 'overall_assessment', 'strengths', 'weaknesses', 'recommendations', 'risk_alerts'],
}, null, 2);

export function buildPortfolioReviewPrompt(
  positions: Record<string, any>[],
  summary: Record<string, any>,
  riskMetrics: Record<string, any>,
  healthScore: Record<string, any>,
  concentration: Record<string, any>,
  regimeData: Record<string, any>,
): [string, string] {
  const systemPrompt =
    'You are a portfolio analyst advising an India-based investor in US equities. ' +
    'Prioritize capital preservation and risk-adjusted returns over S&P 500 long-term. ' +
    'Base reasoning ONLY on provided data. No hype language. No guaranteed returns. ' +
    'Output valid JSON matching the schema.';

  const userPrompt =
    '## Portfolio Positions\n' +
    `\`\`\`json\n${JSON.stringify(positions, null, 2)}\n\`\`\`\n\n` +
    '## Portfolio Summary\n' +
    `\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\n` +
    '## Risk Metrics\n' +
    `\`\`\`json\n${JSON.stringify(riskMetrics, null, 2)}\n\`\`\`\n\n` +
    '## Health Score\n' +
    `\`\`\`json\n${JSON.stringify(healthScore, null, 2)}\n\`\`\`\n\n` +
    '## Concentration\n' +
    `\`\`\`json\n${JSON.stringify(concentration, null, 2)}\n\`\`\`\n\n` +
    '## Market Regime\n' +
    `\`\`\`json\n${JSON.stringify(regimeData, null, 2)}\n\`\`\`\n\n` +
    '---\n\n' +
    'Grade the portfolio A-F based on: diversification, risk management, ' +
    'position quality, and alignment with long-term growth goals. ' +
    'Identify the investment stage, strengths, weaknesses, and actionable recommendations. ' +
    'Flag urgent risk alerts only if critical issues exist (otherwise empty array).\n\n' +
    'Produce a JSON object that matches this schema exactly ' +
    '(no additional keys, no markdown fences):\n\n' +
    `\`\`\`\n${PORTFOLIO_REVIEW_SCHEMA}\n\`\`\`\n\n` +
    'Return ONLY the raw JSON object.';

  return [systemPrompt, userPrompt];
}

export function buildMarketOutlookPrompt(
  regimeData: Record<string, any>,
  macroData: Record<string, any>,
  sectorData: Record<string, any>,
): [string, string] {
  const systemPrompt =
    'You are a macro strategist. Given the following regime, ' +
    'macroeconomic, and sector-level data, provide a concise market ' +
    'outlook. Never guarantee returns. Base reasoning ONLY on provided ' +
    'data. Output valid JSON matching the schema.';

  const userPrompt =
    '## Market Regime\n' +
    `\`\`\`json\n${JSON.stringify(regimeData, null, 2)}\n\`\`\`\n\n` +
    '## Macroeconomic Indicators\n' +
    `\`\`\`json\n${JSON.stringify(macroData, null, 2)}\n\`\`\`\n\n` +
    '## Sector Performance\n' +
    `\`\`\`json\n${JSON.stringify(sectorData, null, 2)}\n\`\`\`\n\n` +
    '---\n\n' +
    'Produce a JSON object that matches this schema exactly ' +
    '(no additional keys, no markdown fences):\n\n' +
    `\`\`\`\n${OUTLOOK_SCHEMA}\n\`\`\`\n\n` +
    'Return ONLY the raw JSON object.';

  return [systemPrompt, userPrompt];
}
