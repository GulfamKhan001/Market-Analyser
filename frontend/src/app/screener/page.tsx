"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { analysisAPI } from "@/lib/api";
import { ScreenerTable } from "@/components/tables/ScreenerTable";
import { CompositeScoreBar } from "@/components/cards/CompositeScoreBar";

export default function ScreenerPage() {
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
      <h1 className="text-2xl font-bold">Stock Screener</h1>

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
          <p className="text-gray-500">Running screener...</p>
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
          <p className="text-gray-500">
            No stocks match current filters. Try lowering the score thresholds.
          </p>
        )}
      </div>
    </div>
  );
}
