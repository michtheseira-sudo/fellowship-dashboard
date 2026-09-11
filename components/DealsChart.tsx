"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DealsBreakdown } from "@/lib/types";

export default function DealsChart({ deals }: { deals: DealsBreakdown }) {
  const data = deals.monthly.map((m) => ({
    month: `${m.monthLabel} ${String(m.year).slice(2)}`,
    Won: m.won,
    Lost: m.lost,
  }));
  const winRatePct = Math.round(deals.winRate * 100);
  const lostDelta = deals.weekOverWeekLostDelta;
  // For Closed Lost, "up" is bad - more lost deals this week than last -
  // so the delta color logic is inverted relative to the pacing cards.
  const lostDeltaColor = lostDelta > 0 ? "text-danger" : lostDelta < 0 ? "text-success" : "text-muted";
  const lostDeltaSign = lostDelta > 0 ? "+" : lostDelta < 0 ? "−" : "±";

  return (
    <div className="border border-line p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-head text-sm font-medium text-ink">Deals — Closed Won vs Closed Lost</h3>
        <span className={`font-mono text-sm tabular ${winRatePct >= 50 ? "text-success" : "text-danger"}`}>
          {winRatePct}% win rate
        </span>
      </div>
      <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-line">
        <span className="text-xs text-muted">Closed Lost this week</span>
        <span className="font-mono text-sm tabular">
          <span className="text-ink font-medium">{deals.thisWeekLost.toLocaleString()}</span>
          <span className={`ml-2 ${lostDeltaColor}`}>
            {lostDeltaSign}
            {Math.abs(lostDelta).toLocaleString()} vs last week
          </span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid stroke="#E3E1E3" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={{ stroke: "#E3E1E3" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Won" fill="#15803D" />
          <Bar dataKey="Lost" fill="#B91C1C" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
