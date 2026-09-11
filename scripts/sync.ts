/**
 * Manual/local version of the sync job, for testing outside of Vercel.
 * In production, app/api/cron/sync/route.ts is the one Vercel Cron
 * actually triggers (see vercel.json) - keep the real sync logic in sync
 * between the two once implemented, or have one call the other.
 *
 * Usage: npm run sync
 *
 * NOT YET IMPLEMENTED - this is a scaffold showing where the real sync
 * logic goes once credentials are confirmed. See lib/providers/*.ts for
 * the per-source TODOs.
 */
import { getDb } from "@/lib/db";

async function main() {
  const db = getDb();
  const startedAt = new Date().toISOString();

  console.log("[sync] starting - USE_MOCK_DATA:", process.env.USE_MOCK_DATA);

  if (process.env.USE_MOCK_DATA !== "false") {
    console.log("[sync] USE_MOCK_DATA is true - nothing to sync, dashboard reads live mock data.");
    return;
  }

  try {
    // TODO: call lib/providers/hubspot.ts, ga4.ts, shopify.ts functions here,
    // write results into funnel_weekly / attribution_weekly tables via `db`.
    db.prepare(
      `INSERT INTO sync_log (job, status, message, ran_at) VALUES (?, ?, ?, ?)`
    ).run("full_sync", "not_implemented", "Sync logic not yet wired up.", startedAt);
    console.log("[sync] scaffold ran, but no real sync logic is implemented yet.");
  } catch (err: any) {
    console.error("[sync] failed:", err.message);
    process.exit(1);
  }
}

main();
