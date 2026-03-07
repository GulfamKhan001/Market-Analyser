"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { regimeAPI, portfolioAPI, aiAPI } from "@/lib/api";
import { RegimeBadge } from "@/components/cards/RegimeBadge";
import { StatCard } from "@/components/cards/StatCard";
import { formatCurrency, formatPercent } from "@/lib/utils";
import Link from "next/link";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import type { PortfolioReviewResponse } from "@/types";

const SUGGESTED_QUERIES = [
  "Which position should I trim?",
  "Am I over-concentrated?",
  "What's my biggest risk?",
  "Should I rebalance?",
  "How does regime affect me?",
  "What's dragging performance?",
];

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  A: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", glow: "shadow-emerald-500/5" },
  B: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", glow: "shadow-blue-500/5" },
  C: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", glow: "shadow-amber-500/5" },
  D: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20", glow: "shadow-orange-500/5" },
  F: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", glow: "shadow-red-500/5" },
};

const GRADE_LABEL: Record<string, string> = {
  A: "looking great",
  B: "solid foundation",
  C: "needs some work",
  D: "time to rethink",
  F: "major red flags",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const regime = useQuery({ queryKey: ["regime"], queryFn: regimeAPI.getCurrent });
  const portfolio = useQuery({ queryKey: ["portfolio-summary"], queryFn: portfolioAPI.getSummary });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: portfolioAPI.getRisk });
  const review = useQuery<PortfolioReviewResponse>({
    queryKey: ["portfolio-review"],
    queryFn: () => aiAPI.getPortfolioReview(false),
    staleTime: 60 * 60 * 1000,
  });

  const runReview = async () => {
    setIsRefreshing(true);
    try {
      const data = await aiAPI.getPortfolioReview(true);
      queryClient.setQueryData(["portfolio-review"], data);
    } catch {
      queryClient.invalidateQueries({ queryKey: ["portfolio-review"] });
    } finally {
      setIsRefreshing(false);
    }
  };

  const submitQuery = async () => {
    if (!queryText.trim() || isQuerying) return;
    setIsQuerying(true);
    setQueryAnswer(null);
    try {
      const { answer } = await aiAPI.portfolioQuery(queryText.trim());
      setQueryAnswer(answer);
    } catch (e: any) {
      setQueryAnswer(`Error: ${e.message}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const reviewData = review.data;
  const hasPortfolio = reviewData && !reviewData.empty;
  const hasReview = hasPortfolio && reviewData.review;
  const grade = hasReview ? reviewData.review!.portfolio_grade : null;
  const gradeStyle = grade ? GRADE_COLORS[grade] || GRADE_COLORS.C : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {regime.data && (
          <RegimeBadge
            regime={regime.data.regime_label}
            confidence={regime.data.confidence}
          />
        )}
      </div>

      {/* Portfolio Overview */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Portfolio Overview</h2>
        {portfolio.isLoading || risk.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Value"
              value={formatCurrency(portfolio.data?.total_value)}
              subtitle={`${portfolio.data?.position_count ?? 0} positions`}
            />
            <StatCard
              title="Unrealized P&L"
              value={formatCurrency(portfolio.data?.total_pnl)}
              subtitle={formatPercent(portfolio.data?.total_pnl_pct)}
              trend={
                portfolio.data?.total_pnl > 0
                  ? "up"
                  : portfolio.data?.total_pnl < 0
                  ? "down"
                  : "neutral"
              }
            />
            <StatCard
              title="VaR (95%)"
              value={risk.data?.var_95 != null ? `${(risk.data.var_95 * 100).toFixed(2)}%` : "N/A"}
              subtitle="Daily Value at Risk"
            />
            <StatCard
              title="Sharpe Ratio"
              value={risk.data?.sharpe_ratio?.toFixed(2) ?? "N/A"}
              subtitle="Risk-adjusted return"
            />
          </div>
        )}
      </section>

      {/* Market Regime */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Market Regime</h2>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          {regime.isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-2 w-16" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : regime.data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase">Regime</p>
                <p className="text-lg font-bold">{regime.data.regime_label}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">VIX Regime</p>
                <p className="text-lg">{regime.data.vix_regime ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Yield Curve</p>
                <p className="text-lg">{regime.data.yield_curve_state ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Confidence</p>
                <p className="text-lg">
                  {regime.data.confidence != null
                    ? `${(regime.data.confidence * 100).toFixed(0)}%`
                    : "N/A"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No regime data available. Refresh market data first.</p>
          )}
        </div>
      </section>

      {/* AI Portfolio Review — clean minimal layout */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">AI Review</h2>
          {hasReview && reviewData.analyzed_at && (
            <span className="text-xs text-gray-600">{timeAgo(reviewData.analyzed_at)}</span>
          )}
        </div>

        {/* Loading */}
        {(review.isLoading || isRefreshing) && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
            </div>
          </div>
        )}

        {/* Empty portfolio */}
        {!review.isLoading && !isRefreshing && reviewData?.empty && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 text-center">
            <p className="text-gray-500 text-sm">no positions yet &mdash; <Link href="/portfolio" className="text-blue-400 hover:underline">add some</Link> to get your AI review</p>
          </div>
        )}

        {/* No review yet — CTA */}
        {!review.isLoading && !isRefreshing && hasPortfolio && !hasReview && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 text-center">
            <p className="text-gray-400 text-sm mb-3">get an AI-powered breakdown of your portfolio</p>
            <button
              onClick={runReview}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              Run AI Review
            </button>
          </div>
        )}

        {/* Review result — compact card */}
        {!review.isLoading && !isRefreshing && hasReview && reviewData.review && (() => {
          const r = reviewData.review!;
          const topAlert = r.risk_alerts.length > 0 ? r.risk_alerts[0] : null;
          const topRec = r.recommendations.length > 0 ? r.recommendations[0] : null;

          return (
            <div className="space-y-3">
              {/* Main card: grade + summary */}
              <div className={`rounded-xl border p-5 shadow-lg ${gradeStyle!.bg} ${gradeStyle!.border} ${gradeStyle!.glow}`}>
                <div className="flex items-center gap-4 mb-3">
                  <div className={`text-4xl font-black ${gradeStyle!.text}`}>
                    {grade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${gradeStyle!.text}`}>{r.investment_stage}</span>
                      <span className="text-gray-600">&middot;</span>
                      <span className="text-sm text-gray-500">{GRADE_LABEL[grade!] || ""}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{r.overall_assessment}</p>
                  </div>
                </div>

                {/* Quick hits — only the most important stuff */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {topAlert && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      {topAlert.length > 80 ? topAlert.slice(0, 80) + "..." : topAlert}
                    </span>
                  )}
                  {topRec && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {topRec.length > 80 ? topRec.slice(0, 80) + "..." : topRec}
                    </span>
                  )}
                </div>

                {/* Action row */}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/5">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    {showDetails ? "hide details" : "see full breakdown"}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={runReview}
                    disabled={isRefreshing}
                    className="text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40"
                  >
                    {isRefreshing ? "analyzing..." : "refresh"}
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {showDetails && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-4">
                  {/* Risk alerts */}
                  {r.risk_alerts.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-400 mb-2 uppercase tracking-wider">heads up</p>
                      <div className="space-y-1.5">
                        {r.risk_alerts.map((a, i) => (
                          <p key={i} className="text-sm text-gray-400">{a}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths + weaknesses inline */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-emerald-400 mb-2 uppercase tracking-wider">working well</p>
                      <div className="space-y-1.5">
                        {r.strengths.map((s, i) => (
                          <p key={i} className="text-sm text-gray-400">{s}</p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-400 mb-2 uppercase tracking-wider">watch out</p>
                      <div className="space-y-1.5">
                        {r.weaknesses.map((w, i) => (
                          <p key={i} className="text-sm text-gray-400">{w}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <p className="text-xs font-medium text-blue-400 mb-2 uppercase tracking-wider">next moves</p>
                    <div className="space-y-1.5">
                      {r.recommendations.map((rec, i) => (
                        <p key={i} className="text-sm text-gray-400">
                          <span className="text-blue-400/60 font-mono mr-1.5">{i + 1}.</span>{rec}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Ask AI — inline chat */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitQuery()}
                    placeholder="ask about your portfolio..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                    disabled={isQuerying}
                  />
                  <button
                    onClick={submitQuery}
                    disabled={isQuerying || !queryText.trim()}
                    className="px-3 py-1 text-xs font-medium rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {isQuerying ? "..." : "ask"}
                  </button>
                </div>

                {/* Suggestion chips */}
                {!queryAnswer && !isQuerying && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {SUGGESTED_QUERIES.map((q) => (
                      <button
                        key={q}
                        onClick={() => setQueryText(q)}
                        className="px-2 py-0.5 text-[11px] rounded-full border border-gray-800 text-gray-600 hover:text-gray-300 hover:border-gray-600 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Loading */}
                {isQuerying && (
                  <div className="mt-3 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                )}

                {/* Answer */}
                {!isQuerying && queryAnswer && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {queryAnswer}
                    </div>
                    <button
                      onClick={() => { setQueryAnswer(null); setQueryText(""); }}
                      className="text-[11px] text-gray-600 hover:text-gray-400 mt-2 transition-colors"
                    >
                      clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/screener"
            className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
          >
            <p className="font-medium">Stock Screener</p>
            <p className="text-xs text-gray-500 mt-1">Multi-factor screening</p>
          </Link>
          <Link
            href="/portfolio"
            className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
          >
            <p className="font-medium">Portfolio</p>
            <p className="text-xs text-gray-500 mt-1">Manage positions</p>
          </Link>
          <Link
            href="/regime"
            className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
          >
            <p className="font-medium">Regime</p>
            <p className="text-xs text-gray-500 mt-1">Market conditions</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
