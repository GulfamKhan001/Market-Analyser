"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { portfolioAPI } from "@/lib/api";
import type { StressTestScenario } from "@/types";
import { formatCurrency } from "@/lib/utils";

export function StressTestSimulator() {
  const [customDrop, setCustomDrop] = useState(-15);

  const { data: defaultData, isLoading } = useQuery({
    queryKey: ["stress-test"],
    queryFn: portfolioAPI.getStressTest,
  });

  const customMutation = useMutation({
    mutationFn: (drops: number[]) => portfolioAPI.runCustomStress(drops),
  });

  const scenarios: StressTestScenario[] = [
    ...(defaultData?.scenarios || []),
    ...(customMutation.data?.scenarios || []),
  ];

  const chartData = scenarios.map((s) => ({
    name: s.label,
    impact_pct: s.portfolio_impact_pct,
    impact_usd: s.portfolio_impact_usd,
  }));

  const handleCustomTest = () => {
    customMutation.mutate([customDrop]);
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Stress Test Simulator</h3>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading scenarios...</p>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} layout="vertical">
            <XAxis type="number" tickFormatter={(v) => `${v}%`} stroke="#6b7280" />
            <YAxis type="category" dataKey="name" width={120} stroke="#6b7280" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              itemStyle={{ color: "#e5e7eb" }}
              formatter={(value, name) =>
                name === "impact_pct" ? `${value}%` : formatCurrency(value as number)
              }
            />
            <ReferenceLine x={0} stroke="#4b5563" />
            <Bar dataKey="impact_pct" name="Portfolio Impact">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.impact_pct < -15 ? "#ef4444" : entry.impact_pct < -5 ? "#f59e0b" : "#3b82f6"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-gray-500 text-sm">No stress test data. Add positions first.</p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <label className="text-sm text-gray-400">Custom S&P drop:</label>
        <input
          type="range"
          min={-50}
          max={-1}
          value={customDrop}
          onChange={(e) => setCustomDrop(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-sm text-gray-300 w-12">{customDrop}%</span>
        <button
          onClick={handleCustomTest}
          disabled={customMutation.isPending}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {customMutation.isPending ? "..." : "Test"}
        </button>
      </div>

      {/* Worst hit positions */}
      {scenarios.length > 0 && scenarios[scenarios.length - 1].worst_hit_positions?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Worst hit positions (worst scenario):</p>
          <div className="flex gap-2">
            {scenarios[scenarios.length - 1].worst_hit_positions.map((p) => (
              <span key={p.ticker} className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded">
                {p.ticker}: {formatCurrency(p.impact_usd)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
