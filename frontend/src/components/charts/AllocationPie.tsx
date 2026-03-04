"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface AllocationPieProps {
  sectorAllocation: Record<string, number>;
  positionWeights: { ticker: string; weight_pct: number }[];
}

export function AllocationPie({ sectorAllocation, positionWeights }: AllocationPieProps) {
  const sectorData = Object.entries(sectorAllocation).map(([name, value]) => ({
    name,
    value: Math.round(value * 100) / 100,
  }));

  const holdingData = positionWeights.map((p) => ({
    name: p.ticker,
    value: p.weight_pct,
  }));

  if (!sectorData.length && !holdingData.length) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Allocation</h3>
        <p className="text-gray-500 text-sm">No allocation data available</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Allocation</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          {/* Outer ring: holdings */}
          <Pie
            data={holdingData}
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={80}
            dataKey="value"
            label={({ name, value, cx, cy, midAngle, outerRadius: or }: any) => {
              if (value < 5 || midAngle == null) return null;
              const RADIAN = Math.PI / 180;
              const radius = (or ?? 120) + 20;
              const x = cx + radius * Math.cos(-midAngle * RADIAN);
              const y = cy + radius * Math.sin(-midAngle * RADIAN);
              return (
                <text x={x} y={y} fill="#e5e7eb" fontSize={12} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                  {name} {value}%
                </text>
              );
            }}
            labelLine={false}
          >
            {holdingData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          {/* Inner ring: sectors */}
          <Pie
            data={sectorData}
            cx="50%"
            cy="50%"
            outerRadius={75}
            innerRadius={40}
            dataKey="value"
          >
            {sectorData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.6} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
            itemStyle={{ color: "#e5e7eb" }}
            formatter={(value) => `${value}%`}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
