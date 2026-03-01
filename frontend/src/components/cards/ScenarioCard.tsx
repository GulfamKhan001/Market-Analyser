"use client";

import { cn } from "@/lib/utils";

interface ScenarioCardProps {
  title: string;
  probability: number;
  target: string;
  thesis: string;
  variant: "bull" | "base" | "bear";
}

const variantStyles: Record<string, { border: string; badge: string }> = {
  bull: { border: "border-t-green-500", badge: "bg-green-500/15 text-green-400" },
  base: { border: "border-t-blue-500", badge: "bg-blue-500/15 text-blue-400" },
  bear: { border: "border-t-red-500", badge: "bg-red-500/15 text-red-400" },
};

export function ScenarioCard({
  title,
  probability,
  target,
  thesis,
  variant,
}: ScenarioCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-700 bg-gray-900 p-4 border-t-2",
        styles.border
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", styles.badge)}>
          {(probability * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mb-2 text-lg font-bold text-white">{target}</p>
      <p className="text-sm leading-relaxed text-gray-400">{thesis}</p>
    </div>
  );
}
