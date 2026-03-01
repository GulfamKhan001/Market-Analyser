"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { portfolioAPI } from "@/lib/api";
import { PositionTable } from "@/components/tables/PositionTable";
import { StatCard } from "@/components/cards/StatCard";
import { RiskGauge } from "@/components/cards/RiskGauge";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function PortfolioPage() {
  const queryClient = useQueryClient();
  const positions = useQuery({ queryKey: ["positions"], queryFn: portfolioAPI.getPositions });
  const summary = useQuery({ queryKey: ["portfolio-summary"], queryFn: portfolioAPI.getSummary });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: portfolioAPI.getRisk });

  const [showForm, setShowForm] = useState(false);
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
      setShowForm(false);
      setForm({ ticker: "", entry_date: new Date().toISOString().split("T")[0], entry_price: "", quantity: "", position_type: "long" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: portfolioAPI.deletePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
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
            onClick={() => portfolioAPI.refreshPrices().then(() => queryClient.invalidateQueries())}
            className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700"
          >
            Refresh Prices
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

      {/* Risk Metrics */}
      <RiskGauge
        var95={risk.data?.var_95}
        maxDrawdown={risk.data?.max_drawdown}
        sharpe={risk.data?.sharpe_ratio}
        beta={risk.data?.beta}
      />

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

      {/* Positions Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Positions</h2>
        {positions.data?.positions?.length ? (
          <PositionTable
            positions={positions.data.positions}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        ) : (
          <p className="text-gray-500">
            {positions.isLoading ? "Loading..." : "No positions. Add your first position above."}
          </p>
        )}
      </div>
    </div>
  );
}
