"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface ScoreRadarProps {
  scores: {
    trend: number | null;
    momentum: number | null;
    volatility: number | null;
    volume: number | null;
  };
}

export function ScoreRadar({ scores }: ScoreRadarProps) {
  const data = [
    { subject: "Trend", value: scores.trend ?? 0 },
    { subject: "Momentum", value: scores.momentum ?? 0 },
    { subject: "Volatility", value: scores.volatility ?? 0 },
    { subject: "Volume", value: scores.volume ?? 0 },
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "#9ca3af", fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: "#6b7280", fontSize: 10 }}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "0.5rem",
            color: "#fff",
          }}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
