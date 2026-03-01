"use client";

import { useQuery } from "@tanstack/react-query";
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

export default function RegimePage() {
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
            onClick={() => regimeAPI.refresh()}
            className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Current Regime Details */}
      {regime.data && (
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
      )}

      {/* Regime Timeline */}
      {history.data?.history?.length > 0 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Regime History (180 days)</h2>
          <RegimeTimeline history={history.data.history} />
        </div>
      )}

      {/* Macro Indicators */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Macro Indicators</h2>
        {macro.data ? (
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
          <p className="text-gray-500">
            {macro.isLoading ? "Loading..." : "No macro data. Refresh market data first."}
          </p>
        )}
      </div>
    </div>
  );
}
