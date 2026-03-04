"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { analysisAPI } from "@/lib/api";
import { ScreenerTable } from "@/components/tables/ScreenerTable";
import { CompositeScoreBar } from "@/components/cards/CompositeScoreBar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ScreenerPage() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [minComposite, setMinComposite] = useState(40);
  const [minFundamental, setMinFundamental] = useState(40);
  const [sector, setSector] = useState<string>("");

  const screener = useQuery({
    queryKey: ["screener", minComposite, minFundamental, sector],
    queryFn: () =>
      analysisAPI.getScreener({
        min_composite: minComposite,
        min_fundamental: minFundamental,
        sector: sector || undefined,
      }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stock Screener</h1>
        <button
          onClick={async () => {
            setScanning(true);
            try {
              await analysisAPI.scan();
              await queryClient.invalidateQueries({ queryKey: ["screener"] });
            } finally {
              setScanning(false);
            }
          }}
          disabled={scanning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
        >
          <svg
            className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {scanning ? "Scanning 15 stocks..." : "Scan Market"}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Min Technical Score: {minComposite}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={minComposite}
              onChange={(e) => setMinComposite(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Min Fundamental Score: {minFundamental}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={minFundamental}
              onChange={(e) => setMinFundamental(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              <option value="">All Sectors</option>
              <option value="Technology">Technology</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Financial Services">Financial Services</option>
              <option value="Consumer Cyclical">Consumer Cyclical</option>
              <option value="Communication Services">Communication Services</option>
              <option value="Industrials">Industrials</option>
              <option value="Consumer Defensive">Consumer Defensive</option>
              <option value="Energy">Energy</option>
              <option value="Utilities">Utilities</option>
              <option value="Real Estate">Real Estate</option>
              <option value="Basic Materials">Basic Materials</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        {screener.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : screener.error ? (
          <p className="text-red-400">Error: {(screener.error as Error).message}</p>
        ) : screener.data?.results?.length ? (
          <>
            <p className="text-sm text-gray-500 mb-3">
              {screener.data.count} stocks match filters
            </p>
            <ScreenerTable results={screener.data.results} />
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-1">No stocks match current filters.</p>
            <p className="text-gray-500 text-sm">
              Click <strong className="text-blue-400">Scan Market</strong> to fetch and analyze the default watchlist, or lower the score thresholds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
