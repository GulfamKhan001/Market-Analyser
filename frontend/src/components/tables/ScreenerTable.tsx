"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

interface ScreenerRow {
  ticker: string;
  composite_score: number;
  fundamental_score: number;
  sector: string;
}

interface ScreenerTableProps {
  results: ScreenerRow[];
}

type SortKey = "ticker" | "composite_score" | "fundamental_score" | "sector";

function getScoreBarColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  if (score >= 30) return "bg-orange-500";
  return "bg-red-500";
}

export function ScreenerTable({ results }: ScreenerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sorted = [...results].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  if (!results || results.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-gray-500">
        No screening results
      </div>
    );
  }

  const SortHeader = ({ label, keyName }: { label: string; keyName: SortKey }) => (
    <th className="px-4 py-3">
      <button
        onClick={() => handleSort(keyName)}
        className="inline-flex items-center gap-1 hover:text-white transition-colors"
      >
        {label}
        <ArrowUpDown
          className={cn("h-3 w-3", sortKey === keyName ? "text-blue-400" : "text-gray-600")}
        />
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-800 text-xs uppercase text-gray-400">
          <tr>
            <SortHeader label="Ticker" keyName="ticker" />
            <SortHeader label="Composite" keyName="composite_score" />
            <SortHeader label="Fundamental" keyName="fundamental_score" />
            <SortHeader label="Sector" keyName="sector" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {sorted.map((row) => (
            <tr key={row.ticker} className="bg-gray-900 hover:bg-gray-800/50">
              <td className="px-4 py-3">
                <Link
                  href={`/analysis/${row.ticker}`}
                  className="font-medium text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {row.ticker}
                </Link>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className={cn("h-full rounded-full", getScoreBarColor(row.composite_score))}
                      style={{ width: `${Math.min(row.composite_score, 100)}%` }}
                    />
                  </div>
                  <span className="text-gray-300">{row.composite_score.toFixed(1)}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className={cn("h-full rounded-full", getScoreBarColor(row.fundamental_score))}
                      style={{ width: `${Math.min(row.fundamental_score, 100)}%` }}
                    />
                  </div>
                  <span className="text-gray-300">{row.fundamental_score.toFixed(1)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-400">{row.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
