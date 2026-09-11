import { getMockAttribution, getMockFunnel, getMockWebsite } from "@/lib/mockData";
import { getLiveAttribution, getLiveFunnel } from "@/lib/providers/hubspot";
import { getLiveWebsiteStats } from "@/lib/providers/ga4";
import { getLiveShopifyStats } from "@/lib/providers/shopify";
import type { AttributionResponse, FunnelResponse, Season, WebsiteResponse } from "@/lib/types";

function useMock(): boolean {
  // Defaults to true (safe) if the env var is missing entirely.
  return process.env.USE_MOCK_DATA !== "false";
}

export async function getFunnelData(season: Season): Promise<FunnelResponse> {
  if (useMock()) return getMockFunnel(season);
  return getLiveFunnel(season);
}

export async function getWebsiteData(): Promise<WebsiteResponse> {
  if (useMock()) return getMockWebsite();

  const ga4 = await getLiveWebsiteStats();

  // Shopify is supplementary per the brief - if its scope isn't confirmed
  // yet or the call fails, fall back to zeroed Shopify figures rather than
  // failing the whole tab, since GA4 data alone is still useful.
  let shopify: WebsiteResponse["shopify"] = {
    checkoutStarts: 0,
    checkoutCompletions: 0,
    topProductViews: [],
  };
  try {
    shopify = await getLiveShopifyStats();
  } catch (err: any) {
    console.error("[dataProvider] Shopify fetch failed, continuing with GA4-only data:", err.message);
  }

  return { ...ga4, shopify };
}

export async function getAttributionData(): Promise<AttributionResponse> {
  if (useMock()) return getMockAttribution();
  return getLiveAttribution();
}
