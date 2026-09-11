import { NextRequest, NextResponse } from "next/server";
import { runFullSync } from "@/lib/liveSync";

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
 * an hour.
 *
 * Vercel signs cron requests with a bearer token matching CRON_SECRET -
 * set that env var in Vercel once things are working, so this endpoint
 * can't be triggered by anyone who finds the URL. Until then, it's also
 * safe to visit this URL directly in a browser to trigger a sync manually
 * (e.g. to populate the cache for the first time, without waiting for
 * next Monday).
 *
 * maxDuration is set to 300s in vercel.json for this route specifically -
 * pulling every pipeline stage, deals, and meetings from HubSpot can take
 * a while; this is well within Vercel's current default limits either way.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (process.env.USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      status: "skipped",
      reason: "USE_MOCK_DATA is true — dashboard reads live mock data, nothing to sync.",
    });
  }

  try {
    const status = await runFullSync();
    return NextResponse.json({ status: "ran", ...status });
  } catch (err: any) {
    return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
  }
}
