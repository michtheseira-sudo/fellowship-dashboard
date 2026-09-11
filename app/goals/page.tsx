"use client";

import { useEffect, useState } from "react";
import { toDisplayDate, fromDisplayDate, isValidDisplayDate } from "@/lib/dateFormat";

type GoalsConfig = Record<
  string,
  { seasonDeadline: string; targets: Record<string, number> }
>;

const TARGET_LABELS: Record<string, string> = {
  new_candidate: "New Candidate",
  accepted_fellow: "Accepted Fellow",
  booked_fellow: "Booked Fellow",
  paying_fellow: "Paying Fellow",
  confirmed_fellow: "Confirmed Fellow",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Deadline is edited as DD-MM-YYYY text and converted to ISO on save;
  // this map holds the in-progress display strings per season key.
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.json())
      .then((g: GoalsConfig) => {
        setGoals(g);
        const drafts: Record<string, string> = {};
        for (const [key, entry] of Object.entries(g)) {
          drafts[key] = toDisplayDate(entry.seasonDeadline);
        }
        setDeadlineDrafts(drafts);
      });
  }, []);

  function updateTarget(seasonKey: string, targetKey: string, value: number) {
    if (!goals) return;
    setGoals({
      ...goals,
      [seasonKey]: {
        ...goals[seasonKey],
        targets: { ...goals[seasonKey].targets, [targetKey]: value },
      },
    });
  }

  function updateDeadlineDraft(seasonKey: string, displayValue: string) {
    setDeadlineDrafts({ ...deadlineDrafts, [seasonKey]: displayValue });
    if (goals && isValidDisplayDate(displayValue)) {
      setGoals({
        ...goals,
        [seasonKey]: { ...goals[seasonKey], seasonDeadline: fromDisplayDate(displayValue) },
      });
    }
  }

  async function save() {
    if (!goals) return;
    setSaving(true);
    await fetch("/api/goals", { method: "POST", body: JSON.stringify(goals) });
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  if (!goals) return <div className="px-10 py-8 text-sm text-muted">Loading…</div>;

  return (
    <div className="px-10 py-8 max-w-4xl">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="font-head text-2xl font-semibold text-ink">Goals</h1>
          <p className="text-sm text-muted mt-1">
            Targets set at the start of each quarter, used for the pacing view on the Funnel tab.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-muted">Saved {savedAt}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm border border-brand1 text-brand1 hover:bg-brand1-pastel transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {Object.entries(goals).map(([seasonKey, entry]) => {
        const draft = deadlineDrafts[seasonKey] ?? "";
        const draftInvalid = draft.length > 0 && !isValidDisplayDate(draft);
        return (
          <div key={seasonKey} className="border border-line p-5 mb-6">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-head text-sm font-medium text-ink">{seasonKey}</h2>
              <label className="flex items-center gap-2 text-xs text-muted">
                Quarter deadline
                <input
                  type="text"
                  placeholder="DD-MM-YYYY"
                  value={draft}
                  onChange={(e) => updateDeadlineDraft(seasonKey, e.target.value)}
                  className={`border px-2 py-1 font-mono text-xs text-ink w-28 ${
                    draftInvalid ? "border-brand1" : "border-line"
                  }`}
                />
              </label>
            </div>

            <div className="grid grid-cols-5 gap-4">
              {Object.entries(entry.targets).map(([targetKey, value]) => (
                <label key={targetKey} className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{TARGET_LABELS[targetKey] ?? targetKey}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => updateTarget(seasonKey, targetKey, Number(e.target.value))}
                    className="border border-line px-2 py-1.5 font-mono text-sm text-ink tabular"
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
