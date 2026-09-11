import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Triggered by Vercel Cron every Monday, matching the team's weekly
 * check-in cadence (see vercel.json: "0 6 * * 1" = Monday 06:00 UTC,
 * which is Monday 07:00 in Rome during CET/winter).
 *
 * CAVEAT: Vercel Cron is UTC-only and doesn't support per-schedule
 * timezones, so this drifts to 08:00 Rome time during CEST/summer (late
 * March - late October). The week-boundary math the dashboard uses to
 * decide "this week" vs "last week" (lib/weeks.ts, nowInRome()) is fully
 * DST-correct regardless - only the exact minute this job fires shifts by
 * an hour. If hitting exactly 7am matters more than this, switch the
 * schedule twice a year, or move this to an external scheduler with real
 * IANA timezone support (e.g. Crontap, GitHub Actions with a TZ env var)
 * pointed at this same route.
 *
 * Vercel signs cron requests with a bearer token matching CRON_SECRET -
 * set that env var in Vercel once this is wired to real data, so this
 * endpoint can't be hit by anyone who finds the URL.
 *
 * NOT YET IMPLEMENTED - see TODOs. This currently just proves the
 * endpoint/auth/logging wiring works; it doesn't sync real data yet.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = new Date().toISOString();

  if (process.env.USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      status: "skipped",
      reason: "USE_MOCK_DATA is true — dashboard reads live mock data, nothing to sync.",
    });
  }

  try {
    const db = getDb();
    // TODO: call lib/providers/hubspot.ts (fetchContactsByStage per stage,
    // fetchDealsByStage per mapped stage, fetchMeetings), bucket results by
    // week, and upsert into the funnel_weekly / attribution_weekly tables.
    db.prepare(`INSERT INTO sync_log (job, status, message, ran_at) VALUES (?, ?, ?, ?)`).run(
      "full_sync",
      "not_implemented",
      "Cron endpoint is wired up but the real sync logic is not yet implemented.",
      startedAt
    );
    return NextResponse.json({ status: "ran", note: "Sync logic not yet implemented — see TODOs in this route." });
  } catch (err: any) {
    return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
  }
}
