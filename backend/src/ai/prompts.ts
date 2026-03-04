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
