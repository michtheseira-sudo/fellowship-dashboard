"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyPoint } from "@/lib/types";

// Colors assigned by recency rank, not hardcoded year numbers, so this
// still works correctly if the tracked year range ever changes.
// Most recent = brand1 (primary/purple), next = brand2 (secondary/teal),
// anything older = accent (grey).
function colorForYearRank(years: number[], year: number): string {
  const sorted = [...years].sort((a, b) => a - b);
  const rankFromEnd = sorted.length - 1 - sorted.indexOf(year);
  if (rankFromEnd === 0) return "#78227b";
  if (rankFromEnd === 1) return "#30c2c9";
  return "#8b818b";
}

function pivotByWeek(points: WeeklyPoint[]) {
  const weeks = Array.from(new Set(points.map((p) => p.weekOfSeason))).sort((a, b) => a - b);
  return weeks.map((week) => {
    const row: Record<string, number | string> = { week: `W${week}` };
    for (const p of points.filter((pt) => pt.weekOfSeason === week)) {
      row[String(p.year)] = p.value;
    }
    return row;
  });
}

export default function YoYLineChart({
  title,
  points,
  years,
}: {
  title: string;
  points: WeeklyPoint[];
  years: number[];
}) {
  const data = pivotByWeek(points);

  return (
    <div className="border border-line p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-head text-sm font-medium text-ink">{title}</h3>
        <div className="flex gap-4 text-xs">
          {years.map((y) => (
            <span key={y} className="flex items-center gap-1.5 text-muted">
              <span
                className="w-2.5 h-2.5 inline-block rounded-full"
                style={{ backgroundColor: colorForYearRank(years, y) }}
              />
              {y}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#E3E1E3" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={{ stroke: "#E3E1E3" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }}
            labelStyle={{ fontWeight: 600 }}
          />
          {years.map((y) => (
            <Line
              key={y}
              type="monotone"
              dataKey={String(y)}
              stroke={colorForYearRank(years, y)}
              strokeWidth={y === Math.max(...years) ? 2.5 : 1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
