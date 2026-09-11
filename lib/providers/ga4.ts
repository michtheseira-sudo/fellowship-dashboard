import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { startOfWeek, startOfMonth, addWeeks, format } from "date-fns";
import { nowInRome } from "@/lib/weeks";
import type { WebsitePeriodStats, WeeklyPoint } from "@/lib/types";

function getClient() {
  const credsBase64 = process.env.GA4_SERVICE_ACCOUNT_JSON_BASE64;
  if (!credsBase64) {
    throw new Error("GA4_SERVICE_ACCOUNT_JSON_BASE64 is not set.");
  }
  const credentials = JSON.parse(Buffer.from(credsBase64, "base64").toString("utf-8"));
  return new BetaAnalyticsDataClient({ credentials });
}

function propertyPath() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("GA4_PROPERTY_ID is not set.");
  return `properties/${propertyId}`;
}

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const UNDERPERFORMING_THRESHOLD = 100; // TODO: confirm the right threshold with the team

/**
 * Runs the full set of reports (session duration, top pages, geography,
 * keywords) scoped to a single date range - shared logic for both the
 * "this week" and "this month" periods, so neither drifts out of sync.
 */
async function runPeriodStats(
  client: BetaAnalyticsDataClient,
  property: string,
  dateRange: { startDate: string; endDate: string }
): Promise<WebsitePeriodStats> {
  const [sessionResp, pagesResp, geoResp, keywordsResp] = await Promise.all([
    client.runReport({
      property,
      dateRanges: [dateRange],
      metrics: [{ name: "averageSessionDuration" }],
    }),
    client.runReport({
      property,
      dateRanges: [dateRange],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 100,
    }),
    client.runReport({
      property,
      dateRanges: [dateRange],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 8, // capped so the Geography list stays fully readable
    }),
    // Organic search query data requires Search Console linked to the GA4
    // property - if that link isn't set up, this report comes back empty
    // rather than erroring, so it degrades gracefully.
    client
      .runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "googleSearchConsoleQuery" as any }],
        metrics: [{ name: "clicks" as any }],
        limit: 10,
      })
      .catch(() => [{ rows: [] } as any]),
  ]);

  const avgSessionDurationSeconds = Math.round(
    Number(sessionResp[0].rows?.[0]?.metricValues?.[0]?.value ?? 0)
  );

  const allPages = (pagesResp[0].rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? "",
    views: Number(row.metricValues?.[0]?.value ?? 0),
  }));
  const topPages = allPages.slice(0, 10);
  const underperformingPages = allPages
    .filter((p) => p.views > 0 && p.views < UNDERPERFORMING_THRESHOLD)
    .map((p) => ({ ...p, threshold: UNDERPERFORMING_THRESHOLD }));

  const geography = (geoResp[0].rows ?? [])
    .map((row) => ({
      country: row.dimensionValues?.[0]?.value?.trim() || "(unknown)",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))
    .filter((g) => g.sessions > 0);

  const topKeywords = (keywordsResp[0].rows ?? []).map((row: any) => ({
    keyword: row.dimensionValues?.[0]?.value ?? "",
    clicks: Number(row.metricValues?.[0]?.value ?? 0),
  }));

  return { avgSessionDurationSeconds, topPages, underperformingPages, geography, topKeywords };
}

/**
 * Real calendar-week trend, real dates - not GA4's raw "week" dimension
 * (which is just a relative week-of-year number with no clear anchor).
 * Buckets ~90 days of daily data into Monday-start weeks, keeps the most
 * recent 12 for a readable trend line.
 */
async function getVisitorsOverTime(client: BetaAnalyticsDataClient, property: string): Promise<WeeklyPoint[]> {
  const resp = await client.runReport({
    property,
    dateRanges: [{ startDate: "90daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  const buckets = new Map<string, number>(); // key: week-start ISO date
  for (const row of resp[0].rows ?? []) {
    const dateStr = row.dimensionValues?.[0]?.value; // GA4 returns YYYYMMDD
    if (!dateStr || dateStr.length !== 8) continue;
    const date = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(4, 6)) - 1, Number(dateStr.slice(6, 8)));
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const key = isoDate(weekStart);
    const value = Number(row.metricValues?.[0]?.value ?? 0);
    buckets.set(key, (buckets.get(key) ?? 0) + value);
  }

  const sortedKeys = Array.from(buckets.keys()).sort();
  const recentKeys = sortedKeys.slice(-12); // last 12 weeks only, for a readable chart

  return recentKeys.map((key, idx) => ({
    weekOfSeason: idx + 1, // display components use the real weekStartDate for labels, not this
    weekStartDate: key,
    year: new Date(key).getFullYear(),
    value: buckets.get(key) ?? 0,
  }));
}

export async function getLiveWebsiteStats(): Promise<{
  visitorsOverTime: WeeklyPoint[];
  thisWeek: WebsitePeriodStats;
  thisMonth: WebsitePeriodStats;
}> {
  const client = getClient();
  const property = propertyPath();

  const now = nowInRome();
  const weekRange = { startDate: isoDate(startOfWeek(now, { weekStartsOn: 1 })), endDate: "today" };
  const monthRange = { startDate: isoDate(startOfMonth(now)), endDate: "today" };

  const [visitorsOverTime, thisWeek, thisMonth] = await Promise.all([
    getVisitorsOverTime(client, property),
    runPeriodStats(client, property, weekRange),
    runPeriodStats(client, property, monthRange),
  ]);

  return { visitorsOverTime, thisWeek, thisMonth };
}
