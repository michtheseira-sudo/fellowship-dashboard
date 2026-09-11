import goalsConfig from "@/config/goals.json";
import type { FunnelDripStage, PacingResult, Season, StageSeries } from "@/lib/types";

// A season "officially" runs this many weeks - used to project a final
// number from the current weekly rate. Adjust if the real season length
// differs (e.g. applications open/close on different dates than assumed).
export const SEASON_LENGTH_WEEKS = 20;

const PACING_TRACKED_STAGES = [
  "new_candidate",
  "scheduled_interview",
  "accepted_fellow",
  "booked_fellow",
  "paying_fellow",
  "confirmed_fellow",
] as const;

/**
 * Computes goal pacing (actual vs. target, projection, on/behind pace, and
 * week-over-week delta) for every goal-tracked stage. Works identically on
 * mock data and real HubSpot-derived data - both just need to produce the
 * same StageSeries[] shape.
 */
export function computePacing(
  season: Season,
  stages: StageSeries[],
  currentYear: number = new Date().getFullYear()
): PacingResult[] {
  const goalKey = `${season}-${currentYear}` as keyof typeof goalsConfig;
  const goalEntry = (goalsConfig as any)[goalKey];

  return stages
    .filter((s) => (PACING_TRACKED_STAGES as readonly string[]).includes(s.stageKey))
    .map((s) => {
      const target: number | null = goalEntry?.targets?.[s.stageKey] ?? null;
      const currentYearPoints = s.points
        .filter((p) => p.year === currentYear)
        .sort((a, b) => a.weekOfSeason - b.weekOfSeason);
      const actualToDate = currentYearPoints.reduce((sum, p) => sum + p.value, 0);
      const weeksElapsed = currentYearPoints.length || 1;
      const weeklyRate = actualToDate / weeksElapsed;
      const projectedFinal = target !== null ? Math.round(weeklyRate * SEASON_LENGTH_WEEKS) : null;
      const onPace = target !== null && projectedFinal !== null ? projectedFinal >= target : null;

      // Week-over-week delta: the two most recently completed weeks for the
      // current year. In production this reflects the last completed week
      // vs. the week before it, refreshed by the Monday-morning sync.
      const thisWeekValue = currentYearPoints.at(-1)?.value ?? 0;
      const lastWeekValue = currentYearPoints.at(-2)?.value ?? 0;

      return {
        stageKey: s.stageKey,
        label: s.label,
        target,
        actualToDate,
        projectedFinal,
        onPace,
        seasonDeadline: goalEntry?.seasonDeadline ?? null,
        thisWeekValue,
        lastWeekValue,
        weekOverWeekDelta: thisWeekValue - lastWeekValue,
      };
    });
}

const DRIP_STAGE_KEYS = [
  "new_candidate",
  "accepted_fellow",
  "booked_fellow",
  "paying_fellow",
  "confirmed_fellow",
] as const;

/**
 * Computes the New Candidate -> Confirmed conversion funnel (counts and
 * stage-to-stage conversion rates) for the current year. Same
 * data-shape-agnostic design as computePacing above.
 */
export function computeFunnelDrip(
  stages: StageSeries[],
  currentYear: number = new Date().getFullYear()
): FunnelDripStage[] {
  const counts = DRIP_STAGE_KEYS.map((key) => {
    const stage = stages.find((s) => s.stageKey === key);
    const count = (stage?.points ?? [])
      .filter((p) => p.year === currentYear)
      .reduce((sum, p) => sum + p.value, 0);
    return { key, label: stage?.label ?? key, count };
  });

  const firstStageCount = counts[0]?.count || 1;

  return counts.map((c, i) => ({
    stageKey: c.key,
    label: c.label,
    count: c.count,
    pctOfFirstStage: Math.round((c.count / firstStageCount) * 1000) / 10,
    pctOfPreviousStage:
      i === 0 ? null : Math.round((c.count / (counts[i - 1].count || 1)) * 1000) / 10,
  }));
}
