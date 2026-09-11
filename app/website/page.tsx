"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataError from "@/components/DataError";
import type { WebsiteResponse } from "@/lib/types";

export default function WebsitePage() {
  const [data, setData] = useState<WebsiteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/website")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="px-10 py-8"><DataError message={error} /></div>;
  if (!data) return <div className="px-10 py-8 text-sm text-muted">Loading…</div>;

  return (
    <div className="px-10 py-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-head text-2xl font-semibold text-ink">Website Statistics</h1>
        <p className="text-sm text-muted mt-1">GA4 traffic and behavior, with supplementary Shopify data.</p>
      </header>

      <section className="grid grid-cols-3 gap-6 mb-10 border-b border-line pb-8">
        <Stat label="Avg. session duration" value={`${Math.round(data.avgSessionDurationSeconds / 60)}m ${data.avgSessionDurationSeconds % 60}s`} />
        <Stat label="Checkout starts (Shopify)" value={data.shopify.checkoutStarts.toLocaleString()} />
        <Stat label="Checkout completions (Shopify)" value={data.shopify.checkoutCompletions.toLocaleString()} />
      </section>

      <div className="grid grid-cols-2 gap-6">
        <Panel title="Visitors over time">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.visitorsOverTime.map((p) => ({ week: `W${p.weekOfSeason}`, visitors: p.value }))}>
              <CartesianGrid stroke="#E3E1E3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={{ stroke: "#E3E1E3" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }} />
              <Bar dataKey="visitors" fill="#78227b" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Geography">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.geography} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#E3E1E3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
              <YAxis dataKey="country" type="category" tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }} />
              <Bar dataKey="sessions" fill="#8b818b" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Top pages">
          <ul className="text-sm divide-y divide-line">
            {data.topPages.map((p) => (
              <li key={p.path} className="flex justify-between py-2">
                <span className="text-ink">{p.path}</span>
                <span className="font-mono text-muted tabular">{p.views.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Underperforming pages" subtitle="Below traffic threshold">
          <ul className="text-sm divide-y divide-line">
            {data.underperformingPages.map((p) => (
              <li key={p.path} className="flex justify-between py-2">
                <span className="text-ink">{p.path}</span>
                <span className="font-mono text-danger tabular">
                  {p.views} <span className="text-muted">/ {p.threshold}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Top search keywords">
          <ul className="text-sm divide-y divide-line">
            {data.topKeywords.map((k) => (
              <li key={k.keyword} className="flex justify-between py-2">
                <span className="text-ink">{k.keyword}</span>
                <span className="font-mono text-muted tabular">{k.clicks.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Top product page views" subtitle="Shopify">
          <ul className="text-sm divide-y divide-line">
            {data.shopify.topProductViews.map((p) => (
              <li key={p.product} className="flex justify-between py-2">
                <span className="text-ink">{p.product}</span>
                <span className="font-mono text-muted tabular">{p.views.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="font-mono text-xl text-ink tabular">{value}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line p-5">
      <div className="mb-4">
        <h3 className="font-head text-sm font-medium text-ink">{title}</h3>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
