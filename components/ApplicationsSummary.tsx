import type { ApplicationsBreakdown } from "@/lib/types";

/**
 * Total applications this season split by the season choice made on the
 * application form itself - Summer, Winter, or "Other" (haven't decided
 * yet). Deliberately separate from the Goal Pacing cards below: Other
 * applicants don't count toward either season's goal until they resolve
 * to Summer or Winter, but they're real applicants and matter for total
 * momentum - hiding them would undercount how many people are actually
 * in motion right now.
 */
export default function ApplicationsSummary({ data }: { data: ApplicationsBreakdown }) {
  const total = data.summer + data.winter + data.other;

  return (
    <div className="border border-line p-5">
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-sm text-muted">Total applications</span>
        <span className="font-mono text-xs text-muted tabular">{total.toLocaleString()} total</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-muted mb-1">Summer</div>
          <div className="font-mono text-2xl font-medium text-ink tabular">{data.summer.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Winter</div>
          <div className="font-mono text-2xl font-medium text-ink tabular">{data.winter.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Undecided</div>
          <div className="font-mono text-2xl font-medium text-ink tabular">{data.other.toLocaleString()}</div>
        </div>
      </div>
      {data.other > 0 && (
        <p className="text-xs text-muted mt-4 leading-relaxed">
          Undecided applicants aren't counted toward either season's goal below yet — once someone picks a
          season, they move into that season's numbers automatically. Historically, about 70% of undecided
          applicants go on to choose Summer and 30% choose Winter, if that's useful for a rough read on where
          these {data.other.toLocaleString()} are likely headed.
        </p>
      )}
    </div>
  );
}
