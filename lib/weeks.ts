import { addWeeks, differenceInCalendarWeeks, startOfWeek } from "date-fns";

/**
 * Returns "now" as it would read on a clock in Europe/Rome, so that
 * week boundaries (Monday-Sunday) line up with the team's actual weekly
 * check-in, regardless of what timezone the server or the viewer's
 * browser is in.
 *
 * NOTE: this correctly handles CET/CEST (Rome's DST), but the Vercel Cron
 * job that refreshes the underlying data is UTC-only (Vercel doesn't
 * support per-schedule timezones) and is set to fire at a fixed UTC hour
 * - see vercel.json and the comment in app/api/cron/sync/route.ts. That
 * means the *data refresh* can drift up to an hour around DST changes
 * (late March / late October) even though this function's week-boundary
 * math never does. Worth a manual check after each clock change.
 */
export function nowInRome(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return new Date(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second"))
  );
}

/** Monday-Sunday week boundaries for "this week" and "last week", Rome-local. */
export function currentAndPreviousWeekBounds() {
  const nowRome = nowInRome();
  const thisWeekStart = startOfWeek(nowRome, { weekStartsOn: 1 });
  const lastWeekStart = addWeeks(thisWeekStart, -1);
  return { thisWeekStart, lastWeekStart };
}

/**
 * Season "start" anchors — the point week 1 begins for each season, so that
 * "week 6 of Summer 2026" lines up with "week 6 of Summer 2025" on the same
 * x-axis position, regardless of the actual calendar dates.
 *
 * Adjust these if the real application-open date differs by season/year.
 */
const SEASON_START_MONTH_DAY: Record<"Summer" | "Winter", { month: number; day: number }> = {
  Summer: { month: 1, day: 15 }, // Jan 15 - typical Summer season applications open
  Winter: { month: 7, day: 15 }, // Jul 15 - typical Winter season applications open
};

export function seasonStartDate(season: "Summer" | "Winter", year: number): Date {
  const { month, day } = SEASON_START_MONTH_DAY[season];
  return startOfWeek(new Date(year, month - 1, day), { weekStartsOn: 1 });
}

export function weekOfSeason(date: Date, season: "Summer" | "Winter", year: number): number {
  const start = seasonStartDate(season, year);
  return differenceInCalendarWeeks(date, start, { weekStartsOn: 1 }) + 1;
}

export function dateForWeekOfSeason(
  weekNum: number,
  season: "Summer" | "Winter",
  year: number
): Date {
  const start = seasonStartDate(season, year);
  return addWeeks(start, weekNum - 1);
}
