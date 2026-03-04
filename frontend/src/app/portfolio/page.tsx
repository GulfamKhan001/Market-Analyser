"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { portfolioAPI } from "@/lib/api";
import { PositionTable } from "@/components/tables/PositionTable";
import { StatCard } from "@/components/cards/StatCard";
import { RiskGauge } from "@/components/cards/RiskGauge";
import { PortfolioHealthScore } from "@/components/cards/PortfolioHealthScore";
import { CurrencyExposure } from "@/components/cards/CurrencyExposure";
import { AllocationPie } from "@/components/charts/AllocationPie";
import { StressTestSimulator } from "@/components/charts/StressTestSimulator";
import { MonteCarloFan } from "@/components/charts/MonteCarloFan";
import { TransactionTable } from "@/components/tables/TransactionTable";
import { CsvUpload } from "@/components/upload/CsvUpload";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { SkeletonCard, SkeletonChart, SkeletonTable } from "@/components/ui/Skeleton";

export default function PortfolioPage() {
  const queryClient = useQueryClient();
  const positions = useQuery({ queryKey: ["positions"], queryFn: portfolioAPI.getPositions });
  const summary = useQuery({ queryKey: ["portfolio-summary"], queryFn: portfolioAPI.getSummary });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: portfolioAPI.getRisk });
  const concentration = useQuery({ queryKey: ["concentration"], queryFn: portfolioAPI.getConcentration });

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    entry_date: new Date().toISOString().split("T")[0],
    entry_price: "",
    quantity: "",
    position_type: "long",
  });

  const addMutation = useMutation({
    mutationFn: portfolioAPI.addPosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowForm(false);
      setForm({ ticker: "", entry_date: new Date().toISOString().split("T")[0], entry_price: "", quantity: "", position_type: "long" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: portfolioAPI.deletePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate({
      ticker: form.ticker.toUpperCase(),
      entry_date: form.entry_date,
      entry_price: parseFloat(form.entry_price),
      quantity: parseFloat(form.quantity),
      position_type: form.position_type,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await portfolioAPI.refreshPrices();
                await queryClient.invalidateQueries();
              } finally {
                setRefreshing(false);
              }
            }}
            disabled={refreshing}
            className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-60 flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {refreshing ? "Syncing..." : "Refresh Prices"}
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import CSV
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "Add Position"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary.isLoading || risk.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Value"
            value={formatCurrency(summary.data?.total_value)}
            subtitle={`${summary.data?.position_count ?? 0} positions`}
          />
          <StatCard
            title="Total P&L"
            value={formatCurrency(summary.data?.total_pnl)}
            subtitle={formatPercent(summary.data?.total_pnl_pct)}
            trend={summary.data?.total_pnl > 0 ? "up" : summary.data?.total_pnl < 0 ? "down" : "neutral"}
          />
          <StatCard
            title="Total Cost"
            value={formatCurrency(summary.data?.total_cost)}
          />
          <StatCard
            title="Sharpe Ratio"
            value={risk.data?.sharpe_ratio?.toFixed(2) ?? "N/A"}
          />
        </div>
      )}

      {/* Risk Gauge + Portfolio Health */}
      {risk.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height="h-48" />
          <SkeletonChart height="h-48" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RiskGauge
            var95={risk.data?.var_95}
            maxDrawdown={risk.data?.max_drawdown}
            sharpe={risk.data?.sharpe_ratio}
            beta={risk.data?.beta}
          />
          <PortfolioHealthScore />
        </div>
      )}

      {/* Allocation Pie + Currency Exposure */}
      {summary.isLoading || concentration.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height="h-48" />
          <SkeletonChart height="h-48" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AllocationPie
            sectorAllocation={summary.data?.sector_allocation || {}}
            positionWeights={concentration.data?.position_weights || []}
          />
          <CurrencyExposure />
        </div>
      )}

      {/* Stress Test Simulator */}
      <StressTestSimulator />

      {/* Monte Carlo Fan Chart */}
      <MonteCarloFan />

      {/* Add Position Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">New Position</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              placeholder="Ticker"
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              required
            />
            <input
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Entry Price"
              value={form.entry_price}
              onChange={(e) => setForm({ ...form, entry_price: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Quantity"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              required
            />
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="bg-green-600 text-white rounded px-3 py-2 text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowImport(false); }}
        >
          <div className="relative w-full max-w-lg mx-4 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowImport(false)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 flex items-center justify-center bg-gray-800 border border-gray-700 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <CsvUpload onImportSuccess={() => setShowImport(false)} />
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Positions</h2>
        {positions.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-10 bg-gray-800 rounded w-full" />
            ))}
          </div>
        ) : positions.data?.positions?.length ? (
          <PositionTable
            positions={positions.data.positions}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        ) : (
          <p className="text-gray-500">No positions. Add your first position above.</p>
        )}
      </div>

      {/* Transaction History */}
      <TransactionTable />
    </div>
  );
}
