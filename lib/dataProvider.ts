import { getMockApplications, getMockAttribution, getMockFunnel, getMockWebsite } from "@/lib/mockData";
import { CACHE_KEYS, readCachedJSON } from "@/lib/blobCache";
import type { ApplicationsBreakdown, AttributionResponse, FunnelResponse, Season, WebsiteResponse } from "@/lib/types";

function useMock(): boolean {
  // Defaults to true (safe) if the env var is missing entirely.
  return process.env.USE_MOCK_DATA !== "false";
}

const NOT_SYNCED_MESSAGE =
  "No synced data yet. Click \"Refresh now\" in the sidebar, or wait for the next " +
  "scheduled sync (Sunday evenings) - see lib/liveSync.ts for what the sync actually does.";

export async function getFunnelData(season: Season): Promise<FunnelResponse> {
  if (useMock()) return getMockFunnel(season);
  const cached = await readCachedJSON<FunnelResponse>(CACHE_KEYS.funnel(season));
  if (!cached) throw new Error(NOT_SYNCED_MESSAGE);
  return cached;
}

export async function getApplicationsData(): Promise<ApplicationsBreakdown> {
  if (useMock()) return getMockApplications();
  const cached = await readCachedJSON<ApplicationsBreakdown>(CACHE_KEYS.applications);
  if (!cached) throw new Error(NOT_SYNCED_MESSAGE);
  return cached;
}

export async function getWebsiteData(): Promise<WebsiteResponse> {
  if (useMock()) return getMockWebsite();
  const cached = await readCachedJSON<WebsiteResponse>(CACHE_KEYS.website);
  if (!cached) throw new Error(NOT_SYNCED_MESSAGE);
  return cached;
}

export async function getAttributionData(): Promise<AttributionResponse> {
  if (useMock()) return getMockAttribution();
  const cached = await readCachedJSON<AttributionResponse>(CACHE_KEYS.attribution);
  if (!cached) throw new Error(NOT_SYNCED_MESSAGE);
  return cached;
}
