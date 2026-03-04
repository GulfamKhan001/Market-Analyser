"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { portfolioAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { MonteCarloResult } from "@/types";

export function MonteCarloFan() {
  const { data, isLoading, error } = useQuery<MonteCarloResult>({
    queryKey: ["monte-carlo"],
    queryFn: () => portfolioAPI.getMonteCarlo(1000, 252),
  });

  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Monte Carlo Simulation</h3>
        <p className="text-gray-500 text-sm">Running simulation (1000 paths)...</p>
      </div>
    );
  }

  if (error || !data || !data.percentiles.p50.length) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Monte Carlo Simulation</h3>
        <p className="text-gray-500 text-sm">Insufficient data for simulation. Add positions with historical price data.</p>
      </div>
    );
  }

  // Sample every 5 days to keep chart performant
  const step = 5;
  const chartData = [];
  for (let i = 0; i < data.percentiles.p50.length; i += step) {
    chartData.push({
      day: i,
      p5: data.percentiles.p5[i],
      p25: data.percentiles.p25[i],
      p50: data.percentiles.p50[i],
      p75: data.percentiles.p75[i],
      p95: data.percentiles.p95[i],
    });
  }

  const td = data.terminal_distribution;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
        Monte Carlo Simulation ({data.num_paths} paths, {data.horizon_days} days)
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <XAxis dataKey="day" stroke="#6b7280" label={{ value: "Days", position: "insideBottom", offset: -5 }} />
          <YAxis stroke="#6b7280" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
            itemStyle={{ color: "#e5e7eb" }}
            formatter={(value) => formatCurrency(value as number)}
            labelFormatter={(label) => `Day ${label}`}
          />
          <ReferenceLine y={data.current_value} stroke="#6b7280" strokeDasharray="3 3" label="Current" />
          <Area type="monotone" dataKey="p5" stroke="none" fill="#ef4444" fillOpacity={0.1} name="5th pct" />
          <Area type="monotone" dataKey="p25" stroke="none" fill="#f59e0b" fillOpacity={0.15} name="25th pct" />
          <Area type="monotone" dataKey="p75" stroke="none" fill="#10b981" fillOpacity={0.15} name="75th pct" />
          <Area type="monotone" dataKey="p95" stroke="none" fill="#10b981" fillOpacity={0.1} name="95th pct" />
          <Area type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2} fill="none" name="Median" />
        </AreaChart>
      </ResponsiveContainer>

      {/* Terminal distribution stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div className="text-center">
          <p className="text-xs text-gray-500">Median</p>
          <p className="text-sm font-medium text-gray-200">{formatCurrency(td.median)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Prob of Loss</p>
          <p className={`text-sm font-medium ${td.prob_loss > 0.5 ? "text-red-400" : "text-green-400"}`}>
            {(td.prob_loss * 100).toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Worst 5%</p>
          <p className="text-sm font-medium text-red-400">{formatCurrency(td.worst_case_5pct)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Best 95%</p>
          <p className="text-sm font-medium text-green-400">{formatCurrency(td.best_case_95pct)}</p>
        </div>
      </div>
    </div>
  );
}
