"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { Position } from "@/types";

interface PositionTableProps {
  positions: Position[];
  onDelete?: (id: number) => void;
}

export function PositionTable({ positions, onDelete }: PositionTableProps) {
  if (!positions || positions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-gray-500">
        No positions found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-800 text-xs uppercase text-gray-400">
          <tr>
            <th className="px-4 py-3">Ticker</th>
            <th className="px-4 py-3">Entry Date</th>
            <th className="px-4 py-3 text-right">Entry Price</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Current Price</th>
            <th className="px-4 py-3 text-right">P&L</th>
            <th className="px-4 py-3">Type</th>
            {onDelete && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {positions.map((pos) => {
            const pnl = pos.unrealized_pnl;
            const pnlColor =
              pnl == null
                ? "text-gray-400"
                : pnl >= 0
                  ? "text-green-400"
                  : "text-red-400";

            return (
              <tr key={pos.id} className="bg-gray-900 hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-white">{pos.ticker}</td>
                <td className="px-4 py-3 text-gray-400">{pos.entry_date}</td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatCurrency(pos.entry_price)}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">{pos.quantity}</td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatCurrency(pos.current_price)}
                </td>
                <td className={cn("px-4 py-3 text-right font-medium", pnlColor)}>
                  {formatCurrency(pnl)}
                </td>
                <td className="px-4 py-3 text-gray-400">{pos.position_type}</td>
                {onDelete && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onDelete(pos.id)}
                      className="rounded p-1 text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      aria-label={`Delete ${pos.ticker} position`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
