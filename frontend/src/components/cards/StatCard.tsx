"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}

const trendConfig = {
  up: { icon: TrendingUp, color: "text-green-400" },
  down: { icon: TrendingDown, color: "text-red-400" },
  neutral: { icon: Minus, color: "text-gray-400" },
};

export function StatCard({ title, value, subtitle, trend }: StatCardProps) {
  const trendInfo = trend ? trendConfig[trend] : null;
  const TrendIcon = trendInfo?.icon;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        {title}
      </p>
      <div className="flex items-center gap-2">
        <p className="text-2xl font-bold text-white">{value}</p>
        {TrendIcon && (
          <TrendIcon className={cn("h-5 w-5", trendInfo?.color)} />
        )}
      </div>
      {subtitle && (
        <p className={cn("mt-1 text-sm", trendInfo?.color ?? "text-gray-400")}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
