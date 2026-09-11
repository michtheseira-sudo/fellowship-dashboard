import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/liveSync";

/**
 * Triggered by the "Refresh now" button in the sidebar. This is already
 * behind the app's own Basic Auth gate (proxy.ts) - anyone who can reach
 * this route already had to log into the dashboard itself, so this
 * doesn't need CRON_SECRET the way the scheduled /api/cron/sync route does.
 */
export async function POST() {
  if (process.env.USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      status: "skipped",
      reason: "USE_MOCK_DATA is true — nothing to sync, dashboard is already showing live mock data.",
    });
  }

  try {
    const status = await runFullSync();
    return NextResponse.json({ status: "ran", ...status });
  } catch (err: any) {
    return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
  }
}
