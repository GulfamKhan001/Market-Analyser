"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { analysisAPI, marketAPI, aiAPI } from "@/lib/api";
import { PriceChart } from "@/components/charts/PriceChart";
import { ScoreRadar } from "@/components/charts/ScoreRadar";
import { CompositeScoreBar } from "@/components/cards/CompositeScoreBar";
import { ScenarioCard } from "@/components/cards/ScenarioCard";
import { formatCurrency, formatLargeNumber, formatPercent } from "@/lib/utils";
import { Skeleton, SkeletonScoreBar } from "@/components/ui/Skeleton";

export default function AnalysisPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const upperTicker = ticker?.toUpperCase() ?? "";

  const prices = useQuery({
    queryKey: ["prices", upperTicker],
    queryFn: () => marketAPI.getPrices(upperTicker, "1y"),
    enabled: !!upperTicker,
  });

  const technical = useQuery({
    queryKey: ["technical", upperTicker],
    queryFn: () => analysisAPI.getTechnical(upperTicker),
    enabled: !!upperTicker,
  });

  const fundamental = useQuery({
    queryKey: ["fundamental-analysis", upperTicker],
    queryFn: () => analysisAPI.getFundamental(upperTicker),
    enabled: !!upperTicker,
  });

  const fundamentalData = useQuery({
    queryKey: ["fundamentals", upperTicker],
    queryFn: () => marketAPI.getFundamentals(upperTicker),
    enabled: !!upperTicker,
  });

  const [aiResult, setAiResult] = useState<any>(null);
  const aiMutation = useMutation({
    mutationFn: (deep: boolean) => aiAPI.analyzeTicker(upperTicker, deep),
    onSuccess: (data) => setAiResult(data.result),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{upperTicker}</h1>
          <p className="text-sm text-gray-500">
            {fundamentalData.data?.sector} - {fundamentalData.data?.industry}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => aiMutation.mutate(false)}
            disabled={aiMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {aiMutation.isPending ? "Analyzing..." : "AI Analysis"}
          </button>
          <button
            onClick={() => aiMutation.mutate(true)}
            disabled={aiMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            Deep Analysis
          </button>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Price History</h2>
        {prices.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : prices.data?.data ? (
          <PriceChart data={prices.data.data} />
        ) : (
          <p className="text-gray-500 h-64 flex items-center justify-center">
            No price data
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Technical Scores */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Technical Analysis</h2>
          {technical.data ? (
            <div className="space-y-3">
              <CompositeScoreBar
                label="Composite"
                score={technical.data.scores.composite}
              />
              <CompositeScoreBar
                label="Trend"
                score={technical.data.scores.trend}
              />
              <CompositeScoreBar
                label="Momentum"
                score={technical.data.scores.momentum}
              />
              <CompositeScoreBar
                label="Volatility"
                score={technical.data.scores.volatility}
              />
              <CompositeScoreBar
                label="Volume"
                score={technical.data.scores.volume}
              />
              <div className="mt-4">
                <ScoreRadar scores={technical.data.scores} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mt-4">
                <div>
                  <span className="text-gray-500">RSI: </span>
                  <span>{technical.data.indicators.rsi?.toFixed(1) ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-500">MACD: </span>
                  <span>{technical.data.indicators.macd?.toFixed(3) ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-500">ADX: </span>
                  <span>{technical.data.indicators.adx?.toFixed(1) ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-500">ATR: </span>
                  <span>{technical.data.indicators.atr?.toFixed(2) ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-500">SMA 50: </span>
                  <span>{technical.data.indicators.sma_50?.toFixed(2) ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-500">SMA 200: </span>
                  <span>{technical.data.indicators.sma_200?.toFixed(2) ?? "N/A"}</span>
                </div>
              </div>
            </div>
          ) : technical.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonScoreBar key={i} />
              ))}
              <Skeleton className="h-48 w-full mt-4" />
            </div>
          ) : (
            <p className="text-gray-500">No technical data</p>
          )}
        </div>

        {/* Fundamentals */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Fundamentals</h2>
          {fundamental.data && !fundamental.data.error ? (
            <div className="space-y-3">
              <CompositeScoreBar
                label="Overall"
                score={fundamental.data.total_score}
              />
              <CompositeScoreBar
                label="Value"
                score={fundamental.data.value_score}
              />
              <CompositeScoreBar
                label="Quality"
                score={fundamental.data.quality_score}
              />
              <CompositeScoreBar
                label="Growth"
                score={fundamental.data.growth_score}
              />
              <CompositeScoreBar
                label="Dividend"
                score={fundamental.data.dividend_score}
              />
            </div>
          ) : fundamental.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonScoreBar key={i} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No fundamental data</p>
          )}

          {fundamentalData.data && (
            <div className="grid grid-cols-2 gap-2 text-sm mt-4">
              <div>
                <span className="text-gray-500">Market Cap: </span>
                <span>{formatLargeNumber(fundamentalData.data.market_cap)}</span>
              </div>
              <div>
                <span className="text-gray-500">P/E: </span>
                <span>{fundamentalData.data.pe_ratio?.toFixed(1) ?? "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500">ROE: </span>
                <span>{fundamentalData.data.roe != null ? `${(fundamentalData.data.roe * 100).toFixed(1)}%` : "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500">D/E: </span>
                <span>{fundamentalData.data.debt_to_equity?.toFixed(2) ?? "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500">Rev Growth: </span>
                <span>{formatPercent(fundamentalData.data.revenue_growth)}</span>
              </div>
              <div>
                <span className="text-gray-500">Div Yield: </span>
                <span>{fundamentalData.data.dividend_yield != null ? `${(fundamentalData.data.dividend_yield * 100).toFixed(2)}%` : "N/A"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis Results */}
      {aiResult && (
        <section>
          <h2 className="text-lg font-semibold mb-3">AI Scenario Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScenarioCard
              title="Bull Case"
              probability={aiResult.bull_case.probability}
              target={aiResult.bull_case.target}
              thesis={aiResult.bull_case.thesis}
              variant="bull"
            />
            <ScenarioCard
              title="Base Case"
              probability={aiResult.base_case.probability}
              target={aiResult.base_case.target}
              thesis={aiResult.base_case.thesis}
              variant="base"
            />
            <ScenarioCard
              title="Bear Case"
              probability={aiResult.bear_case.probability}
              target={aiResult.bear_case.target}
              thesis={aiResult.bear_case.thesis}
              variant="bear"
            />
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Confidence: </span>
                <span>{(aiResult.confidence * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-gray-500">Max Drawdown: </span>
                <span>{aiResult.max_drawdown_estimate}</span>
              </div>
              <div>
                <span className="text-gray-500">Position Size: </span>
                <span>{aiResult.position_size_pct}%</span>
              </div>
              <div>
                <span className="text-gray-500">Timeframe: </span>
                <span>{aiResult.timeframe}</span>
              </div>
            </div>
            {aiResult.risk_factors?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 uppercase mb-1">Risk Factors</p>
                <ul className="text-sm space-y-1">
                  {aiResult.risk_factors.map((r: string, i: number) => (
                    <li key={i} className="text-gray-400">- {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
      {aiMutation.isError && (
        <p className="text-red-400 text-sm">
          AI analysis failed: {(aiMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
