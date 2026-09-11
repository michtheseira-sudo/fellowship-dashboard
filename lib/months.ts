import type { WeeklyPoint } from "@/lib/types";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MonthlyPoint {
  monthIndex: number; // 0-11
  monthLabel: string;
  year: number;
  value: number;
}

/** Aggregate weekly points (summed) into calendar-month totals per year. */
export function toMonthlyPoints(points: WeeklyPoint[]): MonthlyPoint[] {
  const buckets = new Map<string, MonthlyPoint>();

  for (const p of points) {
    const date = new Date(p.weekStartDate);
    const monthIndex = date.getMonth();
    const key = `${p.year}-${monthIndex}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.value += p.value;
    } else {
      buckets.set(key, { monthIndex, monthLabel: MONTH_LABELS[monthIndex], year: p.year, value: p.value });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
}

/** Pivot monthly points into chart rows: one row per month label, one column per year. */
export function pivotMonthlyByYear(points: MonthlyPoint[]) {
  const months = Array.from(new Set(points.map((p) => p.monthIndex))).sort((a, b) => a - b);
  return months.map((monthIndex) => {
    const row: Record<string, number | string> = { month: MONTH_LABELS[monthIndex] };
    for (const p of points.filter((pt) => pt.monthIndex === monthIndex)) {
      row[String(p.year)] = p.value;
    }
    return row;
  });
}
