import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "N/A";
  return value.toFixed(decimals);
}

export function formatLargeNumber(value: number | null | undefined): string {
  if (value == null) return "N/A";
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return formatCurrency(value);
}

export function getScoreColor(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 70) return "text-green-500";
  if (score >= 50) return "text-yellow-500";
  if (score >= 30) return "text-orange-500";
  return "text-red-500";
}

export function getRegimeColor(regime: string): string {
  switch (regime) {
    case "RISK_ON": return "bg-green-500";
    case "NEUTRAL": return "bg-yellow-500";
    case "RISK_OFF": return "bg-orange-500";
    case "CRISIS": return "bg-red-500";
    default: return "bg-gray-500";
  }
}

export function getActionColor(action: string): string {
  switch (action) {
    case "BUY": return "text-green-500 bg-green-500/10";
    case "SELL": return "text-red-500 bg-red-500/10";
    case "HOLD": return "text-yellow-500 bg-yellow-500/10";
    case "WATCH": return "text-blue-500 bg-blue-500/10";
    default: return "text-gray-500 bg-gray-500/10";
  }
}
