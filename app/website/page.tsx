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
import { toDisplayDate } from "@/lib/dateFormat";
import type { WebsiteResponse, WebsitePeriodStats } from "@/lib/types";

export default function WebsitePage() {
  const [data, setData] = useState<WebsiteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"thisWeek" | "thisMonth">("thisMonth");

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

  const stats: WebsitePeriodStats = data[period];

  return (
    <div className="px-10 py-8 max-w-6xl">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-head text-2xl font-semibold text-ink">Website Statistics</h1>
          <p className="text-sm text-muted mt-1">GA4 traffic and behavior, with supplementary Shopify data.</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setPeriod("thisWeek")}
            className={`px-3 py-1.5 text-sm border ${
              period === "thisWeek" ? "border-brand1 text-brand1 bg-brand1-pastel" : "border-line text-muted"
            }`}
          >
            This week
          </button>
          <button
            onClick={() => setPeriod("thisMonth")}
            className={`px-3 py-1.5 text-sm border ${
              period === "thisMonth" ? "border-brand1 text-brand1 bg-brand1-pastel" : "border-line text-muted"
            }`}
          >
            This month
          </button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-6 mb-10 border-b border-line pb-8">
        <Stat
          label={`Avg. session duration — ${period === "thisWeek" ? "this week" : "this month"}`}
          value={`${Math.round(stats.avgSessionDurationSeconds / 60)}m ${stats.avgSessionDurationSeconds % 60}s`}
        />
        <Stat label="Checkout starts (Shopify, all-time)" value={data.shopify.checkoutStarts.toLocaleString()} />
        <Stat label="Checkout completions (Shopify, all-time)" value={data.shopify.checkoutCompletions.toLocaleString()} />
      </section>

      <div className="grid grid-cols-2 gap-6">
        <Panel title="Visitors over time" subtitle="Last 12 weeks">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data.visitorsOverTime.map((p) => ({
                week: toDisplayDate(p.weekStartDate).slice(0, 5), // DD-MM, drop year for space
                visitors: p.value,
              }))}
            >
              <CartesianGrid stroke="#E3E1E3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#8A8288" }} axisLine={{ stroke: "#E3E1E3" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8A8288" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ border: "1px solid #E3E1E3", borderRadius: 2, fontSize: 12 }}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Bar dataKey="visitors" fill="#78227b" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Geography" subtitle={period === "thisWeek" ? "This week" : "This month"}>
          {stats.geography.length === 0 ? (
            <div className="text-sm text-muted py-4">No sessions with a known country in this period.</div>
          ) : (
            <ul className="text-sm divide-y divide-line">
              {stats.geography.map((g) => (
                <li key={g.country} className="flex justify-between py-2">
                  <span className="text-ink">{g.country}</span>
                  <span className="font-mono text-muted tabular">{g.sessions.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top pages" subtitle={period === "thisWeek" ? "This week" : "This month"}>
          <ul className="text-sm divide-y divide-line">
            {stats.topPages.map((p) => (
              <li key={p.path} className="flex justify-between py-2">
                <span className="text-ink">{p.path}</span>
                <span className="font-mono text-muted tabular">{p.views.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Underperforming pages" subtitle="Below traffic threshold, this period">
          {stats.underperformingPages.length === 0 ? (
            <div className="text-sm text-muted py-4">None below threshold this period.</div>
          ) : (
            <ul className="text-sm divide-y divide-line">
              {stats.underperformingPages.map((p) => (
                <li key={p.path} className="flex justify-between py-2">
                  <span className="text-ink">{p.path}</span>
                  <span className="font-mono text-danger tabular">
                    {p.views} <span className="text-muted">/ {p.threshold}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top search keywords" subtitle={period === "thisWeek" ? "This week" : "This month"}>
          {stats.topKeywords.length === 0 ? (
            <div className="text-sm text-muted py-4">No Search Console data linked, or none this period.</div>
          ) : (
            <ul className="text-sm divide-y divide-line">
              {stats.topKeywords.map((k) => (
                <li key={k.keyword} className="flex justify-between py-2">
                  <span className="text-ink">{k.keyword}</span>
                  <span className="font-mono text-muted tabular">{k.clicks.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top product page views" subtitle="Shopify, all-time">
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
