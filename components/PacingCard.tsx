import type { PacingResult } from "@/lib/types";
import { toDisplayDate } from "@/lib/dateFormat";

export default function PacingCard({ pacing }: { pacing: PacingResult }) {
  const hasTarget = pacing.target !== null;
  const delta = pacing.weekOverWeekDelta;
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const deltaAbs = Math.abs(delta);
  // Week-over-week: more is good (green), less is a step back (red), flat is neutral.
  const deltaColorClass = delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted";

  return (
    <div className="border border-line p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{pacing.label}</span>
        <span className={`font-mono text-xs tabular ${deltaColorClass}`} title="Change vs. last week's check-in">
          {deltaSign}
          {deltaAbs.toLocaleString()} vs last week
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-medium text-ink tabular">
          {pacing.actualToDate.toLocaleString()}
        </span>
        {hasTarget && (
          <span className="font-mono text-sm text-muted tabular">/ {pacing.target?.toLocaleString()}</span>
        )}
      </div>

      {hasTarget && pacing.projectedFinal !== null ? (
        <div className="text-xs leading-relaxed">
          <span className={pacing.onPace ? "text-success font-medium" : "text-danger font-medium"}>
            {pacing.onPace ? "On track" : "Behind pace"}
          </span>
          <span className="text-muted">
            {" "}
            — at current weekly rate, projected {pacing.projectedFinal.toLocaleString()}
            {pacing.seasonDeadline ? ` by ${toDisplayDate(pacing.seasonDeadline)}` : ""}.
          </span>
        </div>
      ) : (
        <div className="text-xs text-muted">No target set for this quarter yet — set one on the Goals page.</div>
      )}

      {hasTarget && (
        <div className="w-full h-1.5 bg-line/60 mt-1">
          <div
            className={`h-1.5 ${pacing.onPace ? "bg-success" : "bg-danger"}`}
            style={{
              width: `${Math.min(100, ((pacing.projectedFinal ?? 0) / (pacing.target || 1)) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
