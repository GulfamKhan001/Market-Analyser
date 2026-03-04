"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { portfolioAPI } from "@/lib/api";
import type { Transaction } from "@/types";
import { formatCurrency } from "@/lib/utils";

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    BUY: "bg-green-500/10 text-green-400",
    SELL: "bg-red-500/10 text-red-400",
    DIVIDEND: "bg-blue-500/10 text-blue-400",
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-gray-500/10 text-gray-400"}`}>
      {type}
    </span>
  );
}

export function TransactionTable() {
  const [tickerFilter, setTickerFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", tickerFilter],
    queryFn: () => portfolioAPI.getTransactions(tickerFilter || undefined),
  });

  const transactions: Transaction[] = data?.transactions || [];

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase">Transaction History</h3>
        <input
          type="text"
          placeholder="Filter by ticker..."
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value.toUpperCase())}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-32"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading transactions...</p>
      ) : transactions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Ticker</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Fees</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 text-gray-300">{txn.date}</td>
                  <td className="py-2"><TypeBadge type={txn.transaction_type} /></td>
                  <td className="py-2 font-medium text-gray-200">{txn.ticker}</td>
                  <td className="py-2 text-right text-gray-300">{txn.quantity}</td>
                  <td className="py-2 text-right text-gray-300">{formatCurrency(txn.price)}</td>
                  <td className="py-2 text-right text-gray-200">{formatCurrency(txn.total_amount)}</td>
                  <td className="py-2 text-right text-gray-400">{txn.fees > 0 ? formatCurrency(txn.fees) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No transactions recorded yet.</p>
      )}
    </div>
  );
}
