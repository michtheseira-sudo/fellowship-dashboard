"use client";

import { useEffect, useState } from "react";
import { toDisplayDate } from "@/lib/dateFormat";

interface StatusResponse {
  mock: boolean;
  status?: { lastRunAt: string; results: Record<string, { ok: boolean; message?: string }> } | null;
}

function formatSyncedAt(iso: string): string {
  const d = new Date(iso);
  const datePart = toDisplayDate(iso);
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}

export default function SyncStatus() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  function loadStatus() {
    fetch("/api/sync-status")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/sync-now", { method: "POST" });
      const json = await res.json();
      if (json.status === "ran") {
        const failures = Object.entries(json.results ?? {}).filter(([, v]: any) => !v.ok);
        setRefreshResult(failures.length === 0 ? "Refreshed successfully." : `Refreshed with ${failures.length} issue(s) - see below.`);
      } else if (json.status === "skipped") {
        setRefreshResult(json.reason);
      } else {
        setRefreshResult(`Failed: ${json.message}`);
      }
      loadStatus();
    } catch (err: any) {
      setRefreshResult(`Failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (!data) return null;

  if (data.mock) {
    return (
      <div className="mt-auto pt-8 border-t border-line text-xs text-muted leading-relaxed">
        Data source: <span className="font-mono">mock</span>
        <br />
        Set USE_MOCK_DATA=false once HubSpot / GA4 credentials are live.
      </div>
    );
  }

  const lastRunAt = data.status?.lastRunAt;
  const failedSources = Object.entries(data.status?.results ?? {}).filter(([, v]) => !v.ok);

  return (
    <div className="mt-auto pt-8 border-t border-line text-xs text-muted leading-relaxed">
      <div className="mb-2">
        Last synced:{" "}
        <span className="font-mono text-ink">{lastRunAt ? formatSyncedAt(lastRunAt) : "never yet"}</span>
      </div>
      {failedSources.length > 0 && (
        <div className="text-danger mb-2">
          {failedSources.length} source(s) failed last sync — hover Refresh to retry.
        </div>
      )}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="w-full text-center px-3 py-1.5 border border-brand1 text-brand1 hover:bg-brand1-pastel transition-colors disabled:opacity-50 mb-2"
      >
        {refreshing ? "Refreshing…" : "Refresh now"}
      </button>
      {refreshResult && <div>{refreshResult}</div>}
    </div>
  );
}
