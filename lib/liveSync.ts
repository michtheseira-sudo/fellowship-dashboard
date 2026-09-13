import { CACHE_KEYS, writeCachedJSON, type SyncStatus } from "@/lib/blobCache";
import { getLiveFunnelBundle, getLiveAttribution } from "@/lib/providers/hubspot";
import { getLiveWebsiteStats } from "@/lib/providers/ga4";
import { getLiveShopifyStats } from "@/lib/providers/shopify";
import type { WebsiteResponse } from "@/lib/types";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Runs the full weekly sync: pulls fresh data from HubSpot, GA4, and
 * Shopify, and writes each into Blob cache. Every regular page load reads
 * from that cache instead of calling these APIs live - this function is
 * the only place that actually talks to HubSpot/GA4/Shopify on a schedule.
 *
 * Each source is wrapped separately so one failing source (e.g. Shopify
 * credentials not set up yet) doesn't stop the others from syncing. The
 * delays between phases below are on top of the per-call spacing inside
 * lib/providers/hubspot.ts itself - HubSpot's per-second rate limit is
 * strict enough that even the gap between funnel/website/attribution
 * needs a deliberate pause.
 */
export async function runFullSync(): Promise<SyncStatus> {
  const results: SyncStatus["results"] = {};

  // getLiveFunnelBundle fetches cohorts (Summer+Winter+Other together),
  // deals, and meetings exactly ONCE and builds Summer, Winter, and the
  // Applications breakdown from that shared data - see its comment in
  // lib/providers/hubspot.ts for why this replaced two separate
  // season-by-season live fetches.
  try {
    const { summer, winter, applications } = await getLiveFunnelBundle();
    await writeCachedJSON(CACHE_KEYS.funnel("Summer"), { ...summer, syncedAt: new Date().toISOString() });
    await writeCachedJSON(CACHE_KEYS.funnel("Winter"), { ...winter, syncedAt: new Date().toISOString() });
    await writeCachedJSON(CACHE_KEYS.applications, { ...applications, syncedAt: new Date().toISOString() });
    results["funnel-summer"] = { ok: true };
    results["funnel-winter"] = { ok: true };
    results.applications = { ok: true };
  } catch (err: any) {
    // One shared fetch now backs all three, so a failure here means all
    // three are stale together, unlike before where one season could
    // succeed while the other failed.
    results["funnel-summer"] = { ok: false, message: err.message };
    results["funnel-winter"] = { ok: false, message: err.message };
    results.applications = { ok: false, message: err.message };
  }
  await delay(1000);

  try {
    const ga4 = await getLiveWebsiteStats();
    let shopify: WebsiteResponse["shopify"] = { checkoutStarts: 0, checkoutCompletions: 0, topProductViews: [] };
    try {
      shopify = await getLiveShopifyStats();
    } catch {
      // Shopify not set up yet - GA4-only data is still useful, don't fail the whole sync over it.
    }
    await writeCachedJSON(CACHE_KEYS.website, { ...ga4, shopify, syncedAt: new Date().toISOString() });
    results.website = { ok: true };
  } catch (err: any) {
    results.website = { ok: false, message: err.message };
  }
  await delay(1000);

  try {
    const attribution = await getLiveAttribution();
    await writeCachedJSON(CACHE_KEYS.attribution, { ...attribution, syncedAt: new Date().toISOString() });
    results.attribution = { ok: true };
  } catch (err: any) {
    results.attribution = { ok: false, message: err.message };
  }

  const status: SyncStatus = { lastRunAt: new Date().toISOString(), results };
  await writeCachedJSON(CACHE_KEYS.syncStatus, status);
  return status;
}
