"use client";

import { cn } from "@/lib/utils";

interface CompositeScoreBarProps {
  label: string;
  score: number | null;
  maxScore?: number;
}

function getBarColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.7) return "bg-green-500";
  if (pct >= 0.5) return "bg-yellow-500";
  if (pct >= 0.3) return "bg-orange-500";
  return "bg-red-500";
}

export function CompositeScoreBar({
  label,
  score,
  maxScore = 100,
}: CompositeScoreBarProps) {
  const pct = score != null ? Math.min((score / maxScore) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{label}</span>
        <span
          className={cn(
            "text-sm font-semibold",
            score != null ? "text-white" : "text-gray-500"
          )}
        >
          {score != null ? score.toFixed(1) : "N/A"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
        {score != null && (
          <div
            className={cn("h-full rounded-full transition-all", getBarColor(score, maxScore))}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
