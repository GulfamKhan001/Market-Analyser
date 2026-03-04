"use client";

import { useQuery } from "@tanstack/react-query";
import { portfolioAPI } from "@/lib/api";
import type { CurrencyExposureData } from "@/types";
import { formatCurrency } from "@/lib/utils";

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CurrencyExposure() {
  const { data, isLoading } = useQuery<CurrencyExposureData>({
    queryKey: ["currency-exposure"],
    queryFn: portfolioAPI.getCurrency,
  });

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Currency Exposure (USD/INR)</h3>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading currency data...</p>
      ) : data ? (
        <div className="space-y-4">
          {/* Rate and values */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-500">USD/INR Rate</p>
              <p className="text-lg font-bold text-blue-400">{data.usd_inr_rate}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Portfolio (USD)</p>
              <p className="text-sm font-medium text-gray-200">{formatCurrency(data.portfolio_value_usd)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Portfolio (INR)</p>
              <p className="text-sm font-medium text-gray-200">{formatINR(data.portfolio_value_inr)}</p>
            </div>
          </div>

          {/* FX Volatility */}
          <div className="text-center">
            <span className="text-xs text-gray-500">FX Volatility (annualized): </span>
            <span className={`text-xs font-medium ${data.fx_volatility_pct > 10 ? "text-red-400" : "text-yellow-400"}`}>
              {data.fx_volatility_pct}%
            </span>
          </div>

          {/* Sensitivity table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="py-1 text-left">INR Move</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">Value (INR)</th>
                <th className="py-1 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {data.inr_sensitivity.map((row) => (
                <tr key={row.inr_move_pct} className="border-b border-gray-800/50">
                  <td className={`py-1 ${row.inr_move_pct === 0 ? "font-bold text-gray-200" : "text-gray-400"}`}>
                    {row.inr_move_pct > 0 ? "+" : ""}{row.inr_move_pct}%
                  </td>
                  <td className="py-1 text-right text-gray-300">{row.adjusted_rate}</td>
                  <td className="py-1 text-right text-gray-300">{formatINR(row.portfolio_value_inr)}</td>
                  <td className={`py-1 text-right ${row.change_inr > 0 ? "text-green-400" : row.change_inr < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {row.change_inr > 0 ? "+" : ""}{formatINR(row.change_inr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No currency data available</p>
      )}
    </div>
  );
}
