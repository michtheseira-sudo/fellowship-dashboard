import type { WebsiteResponse } from "@/lib/types";

/**
 * Shopify Admin API stub (read-only).
 * Scope still needs clarifying with the team per the build brief - this
 * stub covers the most likely candidates (checkout funnel, product/variant
 * views) but should be trimmed or extended once confirmed.
 */
export async function getLiveShopifyStats(): Promise<WebsiteResponse["shopify"]> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!domain || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN not set.");
  }

  // TODO: implement once scope is confirmed with the team. Likely endpoints:
  //   GET /admin/api/2024-07/checkouts.json  (checkout starts/completions)
  //   GET /admin/api/2024-07/products.json + Shopify Analytics API for
  //     product/variant page views (note: Shopify's native analytics API
  //     access varies by plan - may need to pull from GA4 e-commerce events
  //     instead if not available).
  throw new Error("getLiveShopifyStats is not implemented yet — see TODOs in this file.");
}
