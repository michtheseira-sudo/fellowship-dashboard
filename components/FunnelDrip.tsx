import type { FunnelDripStage } from "@/lib/types";

export default function FunnelDrip({ stages }: { stages: FunnelDripStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="border border-line p-5">
      <div className="mb-5">
        <h3 className="font-head text-sm font-medium text-ink">
          Funnel drip — New Candidate → Confirmed
        </h3>
        <p className="text-xs text-muted mt-1">
          Current-year totals. Each bar's width is relative to Applicants; the small number
          between stages is the conversion rate from the stage above it.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        {stages.map((stage, i) => (
          <div key={stage.stageKey}>
            {i > 0 && (
              <div className="flex items-center gap-2 pl-1 py-1">
                <div className="w-px h-4 bg-line ml-2" />
                <span className="font-mono text-xs text-accent">
                  {stage.pctOfPreviousStage}% converted
                </span>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm text-ink shrink-0">{stage.label}</div>
              <div className="flex-1 h-8 bg-line/30 relative">
                <div
                  className="h-8 bg-brand1 flex items-center px-2"
                  style={{ width: `${Math.max(4, (stage.count / maxCount) * 100)}%` }}
                >
                  <span className="font-mono text-xs text-white tabular whitespace-nowrap">
                    {stage.count.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="w-16 text-right font-mono text-xs text-muted tabular shrink-0">
                {stage.pctOfFirstStage}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
