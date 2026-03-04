"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { regimeAPI } from "@/lib/api";
import { RegimeBadge } from "@/components/cards/RegimeBadge";
import { RegimeTimeline } from "@/components/charts/RegimeTimeline";
import { StatCard } from "@/components/cards/StatCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Skeleton, SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";

export default function RegimePage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const regime = useQuery({ queryKey: ["regime"], queryFn: regimeAPI.getCurrent });
  const history = useQuery({
    queryKey: ["regime-history"],
    queryFn: () => regimeAPI.getHistory(180),
  });
  const macro = useQuery({
    queryKey: ["macro-dashboard"],
    queryFn: regimeAPI.getMacroDashboard,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Market Regime</h1>
        <div className="flex items-center gap-3">
          {regime.data && (
            <RegimeBadge
              regime={regime.data.regime_label}
              confidence={regime.data.confidence}
            />
          )}
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await regimeAPI.refresh();
                await queryClient.invalidateQueries();
              } finally {
                setRefreshing(false);
              }
            }}
            disabled={refreshing}
            className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-60 flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {refreshing ? "Fetching data..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Current Regime Details */}
      {regime.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : regime.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Regime" value={regime.data.regime_label} />
          <StatCard title="VIX Regime" value={regime.data.vix_regime ?? "N/A"} />
          <StatCard title="Yield Curve" value={regime.data.yield_curve_state ?? "N/A"} />
          <StatCard
            title="HMM State"
            value={
              regime.data.hmm_state != null
                ? ["Bull", "Sideways", "Bear"][regime.data.hmm_state] ?? `State ${regime.data.hmm_state}`
                : "N/A"
            }
          />
        </div>
      ) : null}

      {/* Regime Timeline */}
      {history.isLoading ? (
        <SkeletonChart height="h-32" />
      ) : history.data?.history?.length > 0 ? (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Regime History (180 days)</h2>
          <RegimeTimeline history={history.data.history} />
        </div>
      ) : null}

      {/* Macro Indicators */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Macro Indicators</h2>
        {macro.isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
              ))}
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : macro.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {macro.data.current.VIX && (
                <StatCard title="VIX" value={macro.data.current.VIX.value.toFixed(2)} />
              )}
              {macro.data.current["10y_yield"] && (
                <StatCard title="10Y Yield" value={`${macro.data.current["10y_yield"].value.toFixed(2)}%`} />
              )}
              {macro.data.yield_spread != null && (
                <StatCard
                  title="Yield Spread (10Y-2Y)"
                  value={`${macro.data.yield_spread.toFixed(2)}%`}
                  trend={macro.data.yield_curve_inverted ? "down" : "up"}
                  subtitle={macro.data.yield_curve_inverted ? "INVERTED" : "Normal"}
                />
              )}
              {macro.data.current.fed_funds_rate && (
                <StatCard title="Fed Funds Rate" value={`${macro.data.current.fed_funds_rate.value.toFixed(2)}%`} />
              )}
              {macro.data.current.unemployment_rate && (
                <StatCard title="Unemployment" value={`${macro.data.current.unemployment_rate.value.toFixed(1)}%`} />
              )}
              {macro.data.current.CPI && (
                <StatCard title="CPI" value={macro.data.current.CPI.value.toFixed(1)} />
              )}
            </div>

            {/* VIX History Chart */}
            {macro.data.history.VIX?.length > 0 && (
              <div>
                <h3 className="text-sm text-gray-400 mb-2">VIX History</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={macro.data.history.VIX}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">No macro data available. Click <strong className="text-gray-400">Refresh</strong> above to fetch VIX, yields, and economic indicators from FRED.</p>
        )}
      </div>
    </div>
  );
}
