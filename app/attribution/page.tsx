"use client";

import { useEffect, useState } from "react";
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
import type { AttributionResponse } from "@/lib/types";

const STAGE_KEYS = [
  { key: "new_candidate", label: "Applicants", color: "#fef0ff" },
  { key: "accepted_fellow", label: "Accepted", color: "#78227b" },
  { key: "booked_fellow", label: "Deposit paid", color: "#8b818b" },
  { key: "paying_fellow", label: "Installment paid", color: "#30c2c9" },
  { key: "confirmed_fellow", label: "Confirmed", color: "#076d73" },
] as const;

export default function AttributionPage() {
  const [data, setData] = useState<AttributionResponse | null>(null);

  useEffect(() => {
    fetch("/api/attribution")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="px-10 py-8 text-sm text-muted">Loading…</div>;

  const utmTotal = data.utmCoverage.withUtm + data.utmCoverage.fallbackHeardAbout + data.utmCoverage.neither;

  return (
    <div className="px-10 py-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-head text-2xl font-semibold text-ink">Marketing Attribution</h1>
        <p className="text-sm text-muted mt-1">
          Source breakdown by funnel stage. UTM data used where present, falling back to
          &ldquo;How did you hear about us?&rdquo; where it isn&rsquo;t.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="font-head text-sm font-medium text-ink mb-1">Lead sources</h2>
        <p className="text-xs text-muted mb-4">
          Top-of-funnel, pre-application — which form brought each Lead in.
        </p>
        <div className="border border-line p-5">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.leadSources} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#E3E1E3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
              <YAxis dataKey="source" type="category" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }} />
              <Bar dataKey="count" fill="#78227b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="border border-line p-4 mb-8 flex gap-8 text-sm">
        <CoverageStat label="UTM captured" value={data.utmCoverage.withUtm} total={utmTotal} color="text-brand2" />
        <CoverageStat
          label="Fallback (heard_about)"
          value={data.utmCoverage.fallbackHeardAbout}
          total={utmTotal}
          color="text-muted"
        />
        <CoverageStat label="Neither" value={data.utmCoverage.neither} total={utmTotal} color="text-danger" />
      </div>

      <div className="border border-line p-5">
        <h2 className="font-head text-sm font-medium text-ink mb-4">Applicants by source, by funnel stage</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data.bySourceByStage} margin={{ left: -10 }}>
            <CartesianGrid stroke="#E3E1E3" vertical={false} />
            <XAxis dataKey="source" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={{ stroke: "#E3E1E3" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {STAGE_KEYS.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CoverageStat({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`font-mono text-lg tabular ${color}`}>
        {value.toLocaleString()} <span className="text-muted text-sm">({pct}%)</span>
      </div>
    </div>
  );
}
