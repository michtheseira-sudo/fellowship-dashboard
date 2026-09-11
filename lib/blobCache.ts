import { put, get } from "@vercel/blob";

/**
 * Reads a JSON blob by its pathname, or returns null if it doesn't exist
 * yet (e.g. the weekly sync hasn't run for the first time).
 */
export async function readCachedJSON<T>(pathname: string): Promise<T | null> {
  try {
    const response = await get(pathname, { access: "private" });
    if (!response) return null;
    const text = await new Response(response.stream).text();
    return JSON.parse(text) as T;
  } catch {
    // Covers both "blob doesn't exist" and any transient read error -
    // either way, the caller should treat this as "not synced yet".
    return null;
  }
}

/**
 * Writes (or overwrites) a JSON blob at a fixed pathname. allowOverwrite
 * is required here since the whole point is updating the same path every
 * Monday, not creating a new file each time.
 */
export async function writeCachedJSON(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

export const CACHE_KEYS = {
  funnel: (season: string) => `cache/funnel-${season.toLowerCase()}.json`,
  website: "cache/website.json",
  attribution: "cache/attribution.json",
  syncStatus: "cache/sync-status.json",
};

export interface SyncStatus {
  lastRunAt: string;
  results: Record<string, { ok: boolean; message?: string }>;
}
