"use client";

import { cn, getRegimeColor } from "@/lib/utils";

interface RegimeTimelineProps {
  history: { date: string; regime_label: string }[];
}

export function RegimeTimeline({ history }: RegimeTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center text-gray-500">
        No regime history available
      </div>
    );
  }

  // Group consecutive same-regime entries into segments
  const segments: { regime: string; startDate: string; endDate: string; count: number }[] = [];
  for (const entry of history) {
    const last = segments[segments.length - 1];
    if (last && last.regime === entry.regime_label) {
      last.endDate = entry.date;
      last.count += 1;
    } else {
      segments.push({
        regime: entry.regime_label,
        startDate: entry.date,
        endDate: entry.date,
        count: 1,
      });
    }
  }

  const total = history.length;

  return (
    <div className="space-y-2">
      {/* Timeline bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={cn("relative", getRegimeColor(seg.regime))}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${seg.regime.replace("_", " ")}: ${seg.startDate} - ${seg.endDate}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        {segments.length > 0 && (
          <>
            <span>{history[0].date}</span>
            <span className="ml-auto">{history[history.length - 1].date}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {["RISK_ON", "NEUTRAL", "RISK_OFF", "CRISIS"].map((r) => (
          <div key={r} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={cn("h-2.5 w-2.5 rounded-sm", getRegimeColor(r))} />
            {r.replace("_", " ")}
          </div>
        ))}
      </div>
    </div>
  );
}
