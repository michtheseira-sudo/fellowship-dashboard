import { CACHE_KEYS, writeCachedJSON, type SyncStatus } from "@/lib/blobCache";
import { getLiveFunnel, getLiveAttribution } from "@/lib/providers/hubspot";
import { getLiveWebsiteStats } from "@/lib/providers/ga4";
import { getLiveShopifyStats } from "@/lib/providers/shopify";
import type { WebsiteResponse } from "@/lib/types";

/**
 * Runs the full weekly sync: pulls fresh data from HubSpot, GA4, and
 * Shopify, and writes each into Blob cache. Every regular page load reads
 * from that cache instead of calling these APIs live - this function is
 * the only place that actually talks to HubSpot/GA4/Shopify on a schedule.
 *
 * Each source is wrapped separately so one failing source (e.g. Shopify
 * credentials not set up yet) doesn't stop the others from syncing.
 */
export async function runFullSync(): Promise<SyncStatus> {
  const results: SyncStatus["results"] = {};

  for (const season of ["Summer", "Winter"] as const) {
    try {
      const data = await getLiveFunnel(season);
      await writeCachedJSON(CACHE_KEYS.funnel(season), { ...data, syncedAt: new Date().toISOString() });
      results[`funnel-${season.toLowerCase()}`] = { ok: true };
    } catch (err: any) {
      results[`funnel-${season.toLowerCase()}`] = { ok: false, message: err.message };
    }
  }

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
