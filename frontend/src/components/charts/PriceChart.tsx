"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PriceChartProps {
  data: { date: string; close: number; volume: number }[];
}

export function PriceChart({ data }: PriceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        No price data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Price Area Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "0.5rem",
              color: "#fff",
            }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Volume Bar Chart */}
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{ top: 0, right: 5, left: 5, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "0.5rem",
              color: "#fff",
            }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(value) => [Number(value).toLocaleString(), "Volume"]}
          />
          <Bar dataKey="volume" fill="#3b82f620" stroke="#3b82f6" strokeWidth={0.5} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
