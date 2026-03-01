"use client";

import { cn, getRegimeColor } from "@/lib/utils";

interface RegimeBadgeProps {
  regime: string;
  confidence?: number | null;
}

const regimeTextColor: Record<string, string> = {
  RISK_ON: "text-green-400",
  NEUTRAL: "text-yellow-400",
  RISK_OFF: "text-orange-400",
  CRISIS: "text-red-400",
};

export function RegimeBadge({ regime, confidence }: RegimeBadgeProps) {
  const bgColor = getRegimeColor(regime);
  const textColor = regimeTextColor[regime] ?? "text-gray-400";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
        bgColor + "/15",
        textColor
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", bgColor)} />
      {regime.replace("_", " ")}
      {confidence != null && (
        <span className="text-xs opacity-75">({(confidence * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}
