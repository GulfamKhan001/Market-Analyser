"use client";

import { useQuery } from "@tanstack/react-query";
import { regimeAPI, portfolioAPI } from "@/lib/api";
import { RegimeBadge } from "@/components/cards/RegimeBadge";
import { StatCard } from "@/components/cards/StatCard";
import { formatCurrency, formatPercent } from "@/lib/utils";
import Link from "next/link";

export default function DashboardPage() {
  const regime = useQuery({ queryKey: ["regime"], queryFn: regimeAPI.getCurrent });
  const portfolio = useQuery({ queryKey: ["portfolio-summary"], queryFn: portfolioAPI.getSummary });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: portfolioAPI.getRisk });

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
      </section>

      {/* Market Regime */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Market Regime</h2>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          {regime.isLoading ? (
            <p className="text-gray-500">Loading regime data...</p>
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

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            href="/analysis/AAPL"
            className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
          >
            <p className="font-medium">Analyze AAPL</p>
            <p className="text-xs text-gray-500 mt-1">Deep dive example</p>
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
