"use client";

import { useQuery } from "@tanstack/react-query";
import { portfolioAPI } from "@/lib/api";
import type { PortfolioHealth } from "@/types";

function getHealthColor(score: number): string {
  if (score >= 75) return "#10b981";
  if (score >= 50) return "#f59e0b";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

function CircularGauge({ score }: { score: number }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getHealthColor(score);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle
        cx="80" cy="80" r={radius}
        fill="none" stroke="#374151" strokeWidth="10"
      />
      <circle
        cx="80" cy="80" r={radius}
        fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 80 80)"
      />
      <text x="80" y="72" textAnchor="middle" fill={color} fontSize="28" fontWeight="bold">
        {Math.round(score)}
      </text>
      <text x="80" y="95" textAnchor="middle" fill="#9ca3af" fontSize="12">
        / 100
      </text>
    </svg>
  );
}

function SubScoreBar({ label, score, max = 25 }: { label: string; score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = getHealthColor(score * 4); // scale to 0-100

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">{score.toFixed(1)}/{max}</span>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function PortfolioHealthScore() {
  const { data, isLoading } = useQuery<PortfolioHealth>({
    queryKey: ["portfolio-health"],
    queryFn: portfolioAPI.getHealth,
  });

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Portfolio Health</h3>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Calculating health score...</p>
      ) : data ? (
        <div className="flex items-center gap-6">
          <CircularGauge score={data.total} />
          <div className="flex-1 space-y-3">
            <SubScoreBar label="Diversification" score={data.diversification} />
            <SubScoreBar label="Risk" score={data.risk} />
            <SubScoreBar label="Performance" score={data.performance} />
            <SubScoreBar label="Balance" score={data.balance} />
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No health data available</p>
      )}
    </div>
  );
}
