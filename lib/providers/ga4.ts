import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type { WebsiteResponse } from "@/lib/types";

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

const DATE_RANGE = { startDate: "90daysAgo", endDate: "today" };

export async function getLiveWebsiteStats(): Promise<
  Pick<
    WebsiteResponse,
    "visitorsOverTime" | "avgSessionDurationSeconds" | "topPages" | "underperformingPages" | "geography" | "topKeywords"
  >
> {
  const client = getClient();
  const property = propertyPath();

  const [visitorsResp, sessionResp, pagesResp, geoResp, keywordsResp] = await Promise.all([
    client.runReport({
      property,
      dateRanges: [DATE_RANGE],
      dimensions: [{ name: "week" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "week" } }],
    }),
    client.runReport({
      property,
      dateRanges: [DATE_RANGE],
      metrics: [{ name: "averageSessionDuration" }],
    }),
    client.runReport({
      property,
      dateRanges: [DATE_RANGE],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 100,
    }),
    client.runReport({
      property,
      dateRanges: [DATE_RANGE],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    // Organic search query data requires Search Console linked to the GA4
    // property - if that link isn't set up, this report comes back empty
    // rather than erroring, so it degrades gracefully.
    client
      .runReport({
        property,
        dateRanges: [DATE_RANGE],
        dimensions: [{ name: "googleSearchConsoleQuery" as any }],
        metrics: [{ name: "clicks" as any }],
        limit: 10,
      })
      .catch(() => [{ rows: [] } as any]),
  ]);

  const visitorsOverTime = (visitorsResp[0].rows ?? []).map((row, idx) => ({
    weekOfSeason: idx + 1,
    weekStartDate: row.dimensionValues?.[0]?.value ?? "",
    year: new Date().getFullYear(),
    value: Number(row.metricValues?.[0]?.value ?? 0),
  }));

  const avgSessionDurationSeconds = Math.round(
    Number(sessionResp[0].rows?.[0]?.metricValues?.[0]?.value ?? 0)
  );

  const allPages = (pagesResp[0].rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? "",
    views: Number(row.metricValues?.[0]?.value ?? 0),
  }));

  const UNDERPERFORMING_THRESHOLD = 100; // TODO: confirm the right threshold with the team
  const topPages = allPages.slice(0, 10);
  const underperformingPages = allPages
    .filter((p) => p.views < UNDERPERFORMING_THRESHOLD)
    .map((p) => ({ ...p, threshold: UNDERPERFORMING_THRESHOLD }));

  const geography = (geoResp[0].rows ?? []).map((row) => ({
    country: row.dimensionValues?.[0]?.value ?? "",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
  }));

  const topKeywords = (keywordsResp[0].rows ?? []).map((row: any) => ({
    keyword: row.dimensionValues?.[0]?.value ?? "",
    clicks: Number(row.metricValues?.[0]?.value ?? 0),
  }));

  return { visitorsOverTime, avgSessionDurationSeconds, topPages, underperformingPages, geography, topKeywords };
}
