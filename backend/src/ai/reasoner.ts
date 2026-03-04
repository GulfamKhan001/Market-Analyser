/**
 * AI reasoning layer — thin orchestration between deterministic analytics
 * and the Claude API via @anthropic-ai/sdk.
 */

import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import {
  AIAnalysisResultSchema,
  ScreeningResultSchema,
  MarketOutlookSchema,
  type AIAnalysisResult,
  type ScreeningResult,
  type MarketOutlook,
} from './schemas';
import {
  buildAnalysisPrompt,
  buildScreeningPrompt,
  buildMarketOutlookPrompt,
} from './prompts';

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    const lines = t.split('\n').filter((l) => !l.trim().startsWith('```'));
    t = lines.join('\n').trim();
  }
  return t;
}

function dbRowToResult(row: any): AIAnalysisResult {
  return AIAnalysisResultSchema.parse({
    bull_case: {
      probability: row.bullProbability,
      target: row.bullTarget,
      thesis: row.bullThesis,
    },
    base_case: {
      probability: row.baseProbability,
      target: row.baseTarget,
      thesis: row.baseThesis,
    },
    bear_case: {
      probability: row.bearProbability,
      target: row.bearTarget,
      thesis: row.bearThesis,
    },
    risk_factors: row.riskFactorsJson ? JSON.parse(row.riskFactorsJson) : [],
    max_drawdown_estimate: row.drawdownEstimate || '',
    position_size_pct: row.positionSizeSuggestion || 0,
    confidence: row.confidenceScore || 0,
    timeframe: row.timeframe || '',
  });
}

export class AIReasoner {
  private client: Anthropic;
  private settings = getSettings();

  constructor() {
    this.client = new Anthropic({ apiKey: this.settings.ANTHROPIC_API_KEY });
  }

  async analyzeTicker(
    ticker: string,
    technicalData: Record<string, any>,
    fundamentalData: Record<string, any>,
    regimeData: Record<string, any>,
    portfolioExposure: Record<string, any>,
    deep: boolean = false,
    prisma?: PrismaClient,
  ): Promise<AIAnalysisResult> {
    const db = prisma || getPrisma();
    const analysisType = deep ? 'deep' : 'standard';
    const model = deep
      ? this.settings.AI_MODEL_DEEP
      : this.settings.AI_MODEL_SCREENING;

    // Check cache
    const cutoff = new Date(
      Date.now() - this.settings.AI_CACHE_HOURS * 60 * 60 * 1000,
    );
    const cached = await db.aIAnalysis.findFirst({
      where: {
        ticker,
        analysisType,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached) {
      console.log(`Cache hit for ${ticker} (${analysisType})`);
      return dbRowToResult(cached);
    }

    // Build prompt & call Claude
    const [systemPrompt, userPrompt] = buildAnalysisPrompt(
      ticker,
      technicalData,
      fundamentalData,
      regimeData,
      portfolioExposure,
    );

    const message = await this.client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = stripCodeFences(
      message.content[0].type === 'text' ? message.content[0].text : '',
    );

    // Parse & validate
    const result = AIAnalysisResultSchema.parse(JSON.parse(responseText));

    // Persist to DB
    await db.aIAnalysis.create({
      data: {
        ticker,
        date: new Date(),
        analysisType,
        modelUsed: model,
        bullProbability: result.bull_case.probability,
        bullTarget: result.bull_case.target,
        bullThesis: result.bull_case.thesis,
        baseProbability: result.base_case.probability,
        baseTarget: result.base_case.target,
        baseThesis: result.base_case.thesis,
        bearProbability: result.bear_case.probability,
        bearTarget: result.bear_case.target,
        bearThesis: result.bear_case.thesis,
        riskFactorsJson: JSON.stringify(result.risk_factors),
        drawdownEstimate: result.max_drawdown_estimate,
        positionSizeSuggestion: result.position_size_pct,
        confidenceScore: result.confidence,
        timeframe: result.timeframe,
        createdAt: new Date(),
      },
    });

    console.log(`Saved ${analysisType} analysis for ${ticker} to DB`);
    return result;
  }

  async screenTickers(
    tickersData: Record<string, any>[],
  ): Promise<ScreeningResult[]> {
    const model = this.settings.AI_MODEL_SCREENING;

    const [systemPrompt, userPrompt] = buildScreeningPrompt(tickersData);

    const message = await this.client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = stripCodeFences(
      message.content[0].type === 'text' ? message.content[0].text : '',
    );

    const rawList = JSON.parse(responseText);
    return rawList.map((item: any) => ScreeningResultSchema.parse(item));
  }

  async marketOutlook(
    regimeData: Record<string, any>,
    macroData: Record<string, any>,
    sectorData: Record<string, any>,
  ): Promise<MarketOutlook> {
    const model = this.settings.AI_MODEL_SCREENING;

    const [systemPrompt, userPrompt] = buildMarketOutlookPrompt(
      regimeData,
      macroData,
      sectorData,
    );

    const message = await this.client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = stripCodeFences(
      message.content[0].type === 'text' ? message.content[0].text : '',
    );

    return MarketOutlookSchema.parse(JSON.parse(responseText));
  }
}
