"use client";

import { useEffect, useState } from "react";
import FilterBar from "@/components/FilterBar";
import MonthlyYoYChart from "@/components/MonthlyYoYChart";
import PacingCard from "@/components/PacingCard";
import FunnelDrip from "@/components/FunnelDrip";
import StageTabs from "@/components/StageTabs";
import DealsChart from "@/components/DealsChart";
import MeetingsSection from "@/components/MeetingsChart";
import DataError from "@/components/DataError";
import ApplicationsSummary from "@/components/ApplicationsSummary";
import type { ApplicationsBreakdown, FunnelResponse } from "@/lib/types";

export default function FunnelPage() {
  const [season, setSeason] = useState<"Summer" | "Winter">("Summer");
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState(0);

  // Applications breakdown is season-agnostic (Summer/Winter/Other all at
  // once), so it's fetched once, independent of the season toggle above -
  // it doesn't need to reload when the person switches Summer/Winter.
  const [applications, setApplications] = useState<ApplicationsBreakdown | null>(null);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.error) setApplicationsError(d.error);
        else setApplications(d);
      })
      .catch((err) => setApplicationsError(err.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/funnel?season=${season}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.error) {
          setError(d.error);
          setData(null);
        } else {
          setData(d);
        }
        setLoading(false);
        setActiveStage(0);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [season]);

  return (
    <div className="px-10 py-8 max-w-6xl">
      <header className="mb-2">
        <h1 className="font-head text-2xl font-semibold text-ink">Program / Funnel KPIs</h1>
        <p className="text-sm text-muted mt-1">
          Weekly check-ins against quarterly goals, refreshed every Monday morning.
        </p>
      </header>

      {applications && (
        <section className="mb-8 mt-6">
          <ApplicationsSummary data={applications} />
        </section>
      )}
      {applicationsError && <DataError message={applicationsError} />}

      <FilterBar season={season} onSeasonChange={setSeason} />

      {loading && <div className="text-sm text-muted">Loading…</div>}
      {error && <DataError message={error} />}

      {data && (
        <>
          <section className="mb-10">
            <h2 className="font-head text-sm font-medium text-ink mb-1">
              Goal pacing — {season} {new Date().getFullYear()}
            </h2>
            <p className="text-xs text-muted mb-4">
              Targets set at the start of the quarter. Numbers refresh every Monday morning
              (Rome time) — the small figure top-right of each card is the change since last week's check-in.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {data.pacing.map((p) => (
                <PacingCard key={p.stageKey} pacing={p} />
              ))}
            </div>
          </section>

          <section className="mb-10">
            <FunnelDrip stages={data.funnelDrip} />
          </section>

          <section className="mb-10">
            <h2 className="font-head text-sm font-medium text-ink mb-4">
              Pipeline stages — month on month, year-on-year
            </h2>
            <StageTabs
              labels={data.stages.filter((s) => s.stageKey !== "alumni").map((s) => s.label)}
              active={activeStage}
              onChange={setActiveStage}
            />
            {(() => {
              const stage = data.stages.filter((s) => s.stageKey !== "alumni")[activeStage];
              if (!stage) return null;
              return <MonthlyYoYChart title={stage.label} points={stage.points} years={data.years} />;
            })()}
          </section>

          <section className="mb-10">
            <h2 className="font-head text-sm font-medium text-ink mb-4">Deals</h2>
            <DealsChart deals={data.deals} />
          </section>

          <section>
            <h2 className="font-head text-sm font-medium text-ink mb-4">Meetings</h2>
            <MeetingsSection meetings={data.meetings} years={data.years} />
          </section>
        </>
      )}
    </div>
  );
}
