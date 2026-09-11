import MonthlyYoYChart from "@/components/MonthlyYoYChart";
import type { MeetingsBreakdown } from "@/lib/types";

export default function MeetingsSection({
  meetings,
  years,
}: {
  meetings: MeetingsBreakdown;
  years: number[];
}) {
  const completionPct = Math.round(meetings.completionRate * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">
          {meetings.totalCompleted.toLocaleString()} of {meetings.totalBooked.toLocaleString()} scheduled
          meetings completed, current year to date
        </span>
        <span className={`font-mono text-sm tabular ${completionPct >= 50 ? "text-success" : "text-danger"}`}>
          {completionPct}% completed
        </span>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <MonthlyYoYChart title="Meetings Booked" points={meetings.monthlyBooked} years={years} />
        <MonthlyYoYChart title="Meetings Completed" points={meetings.monthlyCompleted} years={years} />
      </div>
    </div>
  );
}
