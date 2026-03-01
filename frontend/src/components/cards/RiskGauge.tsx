"use client";

import { cn, formatNumber } from "@/lib/utils";

interface RiskGaugeProps {
  var95?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  beta?: number | null;
}

function getSeverityColor(metric: string, value: number): string {
  switch (metric) {
    case "var95":
      if (value > -0.02) return "text-green-400";
      if (value > -0.05) return "text-yellow-400";
      if (value > -0.1) return "text-orange-400";
      return "text-red-400";
    case "maxDrawdown":
      if (value > -0.1) return "text-green-400";
      if (value > -0.2) return "text-yellow-400";
      if (value > -0.35) return "text-orange-400";
      return "text-red-400";
    case "sharpe":
      if (value >= 2) return "text-green-400";
      if (value >= 1) return "text-yellow-400";
      if (value >= 0) return "text-orange-400";
      return "text-red-400";
    case "beta":
      if (value <= 0.8) return "text-green-400";
      if (value <= 1.2) return "text-yellow-400";
      if (value <= 1.5) return "text-orange-400";
      return "text-red-400";
    default:
      return "text-gray-400";
  }
}

function MetricCard({
  label,
  value,
  metricKey,
  format,
}: {
  label: string;
  value: number | null | undefined;
  metricKey: string;
  format: (v: number) => string;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      <p className="mb-1 text-xs text-gray-400">{label}</p>
      <p
        className={cn(
          "text-lg font-bold",
          value != null ? getSeverityColor(metricKey, value) : "text-gray-500"
        )}
      >
        {value != null ? format(value) : "N/A"}
      </p>
    </div>
  );
}

export function RiskGauge({ var95, maxDrawdown, sharpe, beta }: RiskGaugeProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard
        label="VaR (95%)"
        value={var95}
        metricKey="var95"
        format={(v) => `${(v * 100).toFixed(2)}%`}
      />
      <MetricCard
        label="Max Drawdown"
        value={maxDrawdown}
        metricKey="maxDrawdown"
        format={(v) => `${(v * 100).toFixed(2)}%`}
      />
      <MetricCard
        label="Sharpe Ratio"
        value={sharpe}
        metricKey="sharpe"
        format={(v) => formatNumber(v, 2)}
      />
      <MetricCard
        label="Beta"
        value={beta}
        metricKey="beta"
        format={(v) => formatNumber(v, 2)}
      />
    </div>
  );
}
