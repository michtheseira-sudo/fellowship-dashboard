import {
  DEAL_PIPELINE_ID,
  DEAL_STAGE_CLOSED_LOST,
  FUNNEL_STAGES,
  HEARD_ABOUT_PROPERTY,
  LEAD_STATUS_PROPERTY,
  MEETING_COMPLETION_FORM_NAMES,
  MEETING_OUTCOME_NO_SHOW_VALUES,
  SEASON_PROPERTY,
  UTM_PROPERTIES,
  YEARS_TRACKED,
} from "@/config/properties";
import { weekOfSeason, dateForWeekOfSeason } from "@/lib/weeks";
import { toMonthlyPoints } from "@/lib/months";
import { computePacing, computeFunnelDrip } from "@/lib/funnelAggregation";
import type { AttributionResponse, DealsBreakdown, FunnelResponse, MeetingsBreakdown, Season, StageSeries, WeeklyPoint } from "@/lib/types";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

/**
 * Buckets a list of dates into WeeklyPoint[] aligned to the given season's
 * week-of-season numbering (same alignment mock data uses, so real and
 * mock data overlay identically on the year-on-year charts). Year is the
 * calendar year of each date - see config/properties.ts YEAR_SOURCE for
 * why (no dedicated "year" property confirmed yet).
 */
function datesToWeeklyPoints(dates: Date[], season: Season): WeeklyPoint[] {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const year = date.getFullYear();
    const week = weekOfSeason(date, season as "Summer" | "Winter", year);
    if (week < 1) continue; // before this season's window - ignore
    const key = `${year}-${week}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: WeeklyPoint[] = [];
  for (const [key, value] of counts.entries()) {
    const [yearStr, weekStr] = key.split("-");
    const year = Number(yearStr);
    const weekOfSeasonNum = Number(weekStr);
    const weekStartDate = dateForWeekOfSeason(weekOfSeasonNum, season as "Summer" | "Winter", year);
    points.push({ weekOfSeason: weekOfSeasonNum, weekStartDate: weekStartDate.toISOString().slice(0, 10), year, value });
  }
  return points.sort((a, b) => a.year - b.year || a.weekOfSeason - b.weekOfSeason);
}

function hubspotHeaders() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    throw new Error(
      "HUBSPOT_PRIVATE_APP_TOKEN is not set. Add it to .env.local or keep USE_MOCK_DATA=true."
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch contacts filtered by season + lead_status, paginated.
 * TODO before first real run:
 *  - Confirm the deal pipeline ID that contains "Invited to enroll",
 *    "Paid deposit", "Paid installment", "Closed won", "Closed lost".
 *  - Confirm whether "year" should be read from a property or derived
 *    from the application/form-submission timestamp (current assumption:
 *    derive from date - see config/properties.ts YEAR_SOURCE).
 */
export async function fetchContactsByStage(season: Season, leadStatusValue: string) {
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`;
  const properties = [
    LEAD_STATUS_PROPERTY,
    SEASON_PROPERTY,
    "createdate",
    UTM_PROPERTIES.source,
    UTM_PROPERTIES.medium,
    UTM_PROPERTIES.campaign,
    HEARD_ABOUT_PROPERTY,
  ];

  const allResults: any[] = [];
  let after: string | undefined = undefined;
  const MAX_PAGES = 50; // safety cap (5,000 contacts) - raise if a single stage genuinely exceeds this

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: SEASON_PROPERTY, operator: "EQ", value: season },
            { propertyName: LEAD_STATUS_PROPERTY, operator: "EQ", value: leadStatusValue },
          ],
        },
      ],
      properties,
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`HubSpot contacts search failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    allResults.push(...(data.results ?? []));

    after = data.paging?.next?.after;
    if (!after) break;

    // HubSpot search API rate limit is generous but not unlimited - a small
    // delay between pages avoids bursting on large result sets.
    await new Promise((r) => setTimeout(r, 100));
  }

  return { results: allResults, total: allResults.length };
}

/**
 * Fetch deals in a stage, filtered by created date range + season.
 * Season on deals: confirm whether season is set directly on the deal or
 * must be read from the associated contact - current assumption is the
 * latter, since season is captured once at application time on the contact.
 */
export async function fetchDealsByStage(dealStageValue: string) {
  if (!DEAL_PIPELINE_ID) {
    throw new Error(
      "DEAL_PIPELINE_ID is not set in .env.local - deal-stage names aren't " +
        "guaranteed unique across pipelines, so this needs the pipeline ID to filter correctly."
    );
  }
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`;
  const allResults: any[] = [];
  let after: string | undefined = undefined;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "dealstage", operator: "EQ", value: dealStageValue },
            { propertyName: "pipeline", operator: "EQ", value: DEAL_PIPELINE_ID },
          ],
        },
      ],
      properties: ["dealstage", "createdate", "closedate"],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`HubSpot deals search failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    allResults.push(...(data.results ?? []));

    after = data.paging?.next?.after;
    if (!after) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  return { results: allResults, total: allResults.length };
}

/**
 * Batch-fetch which HubSpot form (if any) is associated with each meeting.
 * HubSpot doesn't return form associations inline on the meetings search,
 * so this uses the batch associations endpoint (meetings -> forms) in
 * groups of 100 meeting IDs, which is far cheaper than one call per meeting.
 *
 * Returns a map of meetingId -> form name (or undefined if none associated).
 *
 * NOTE: "form" associations on meetings aren't a default HubSpot
 * association type in every portal - if this call 400s, the team's forms
 * may be linked via a different object (e.g. a custom property on the
 * meeting, or associated through the contact rather than the meeting
 * directly). Flag this back if so; the fallback is to associate via the
 * contact's most recent form submission around the meeting's start time.
 */
async function fetchMeetingFormAssociations(meetingIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const BATCH_SIZE = 100;

  for (let i = 0; i < meetingIds.length; i += BATCH_SIZE) {
    const batch = meetingIds.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v4/associations/meetings/forms/batch/read`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
    });
    if (!res.ok) {
      // Don't fail the whole sync over one batch - log and continue, since
      // a partial completion count is far more useful than none.
      console.error(`[hubspot] meeting->form association batch failed: ${res.status} ${await res.text()}`);
      continue;
    }
    const data = await res.json();
    for (const entry of data.results ?? []) {
      const formId = entry.to?.[0]?.toObjectId;
      if (formId) result.set(entry.from.id, formId);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // The associations endpoint gives form IDs, not names - resolve the
  // distinct IDs to names via the Forms API so they can be checked
  // against MEETING_COMPLETION_FORM_NAMES.
  // NOTE: this call requires the "forms" scope on the token - separate
  // from crm.objects.contacts.read/crm.objects.deals.read. Add it in
  // HubSpot's scope picker or this call 403s even if everything else works.
  const distinctFormIds = Array.from(new Set(result.values()));
  const formIdToName = new Map<string, string>();
  for (const formId of distinctFormIds) {
    try {
      const formRes = await fetch(`${HUBSPOT_BASE_URL}/marketing/v3/forms/${formId}`, {
        headers: hubspotHeaders(),
      });
      if (formRes.ok) {
        const formData = await formRes.json();
        if (formData.name) formIdToName.set(formId, formData.name);
      }
    } catch {
      // Skip - a missing form name just means that meeting won't count as completed.
    }
  }

  const meetingIdToFormName = new Map<string, string>();
  for (const [meetingId, formId] of result.entries()) {
    const name = formIdToName.get(formId);
    if (name) meetingIdToFormName.set(meetingId, name);
  }

  return meetingIdToFormName;
}

/**
 * Fetch meetings, classifying completion by associated form name and
 * outcome by the confirmed no-show/canceled values.
 */
/**
 * All deals created in the pipeline, regardless of current stage - used
 * for the "Deals Created" weekly metric (as opposed to fetchDealsByStage,
 * which is used for the Closed Won / Closed Lost breakdown specifically).
 */
export async function fetchAllDealsInPipeline() {
  if (!DEAL_PIPELINE_ID) {
    throw new Error("DEAL_PIPELINE_ID is not set in .env.local.");
  }
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`;
  const allResults: any[] = [];
  let after: string | undefined = undefined;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: DEAL_PIPELINE_ID }] }],
      properties: ["dealstage", "createdate", "closedate"],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`HubSpot deals search (all pipeline) failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    allResults.push(...(data.results ?? []));

    after = data.paging?.next?.after;
    if (!after) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  return { results: allResults, total: allResults.length };
}

export async function fetchMeetings() {
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/meetings/search`;
  const allResults: any[] = [];
  let after: string | undefined = undefined;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      properties: ["hs_meeting_title", "hs_meeting_start_time", "hs_meeting_outcome"],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`HubSpot meetings search failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    allResults.push(...(data.results ?? []));

    after = data.paging?.next?.after;
    if (!after) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const formAssociations = await fetchMeetingFormAssociations(allResults.map((m) => m.id));

  // Classification logic per team's confirmed rules:
  // - No-show/canceled outcome -> not completed, regardless of form.
  // - Otherwise, completed only if associated with one of the recognized
  //   interview/orientation form names.
  const classified = allResults.map((m: any) => {
    const outcome = m.properties?.hs_meeting_outcome;
    const isNoShow = MEETING_OUTCOME_NO_SHOW_VALUES.includes(outcome);
    const associatedFormName = formAssociations.get(m.id);
    const hasRecognizedForm = associatedFormName
      ? MEETING_COMPLETION_FORM_NAMES.includes(associatedFormName)
      : false;
    return {
      ...m,
      isNoShow,
      associatedFormName,
      completed: !isNoShow && hasRecognizedForm,
    };
  });

  return classified;
}

export async function getLiveFunnel(season: Season): Promise<FunnelResponse> {
  const currentYear = new Date().getFullYear();
  const years = [...YEARS_TRACKED];

  // 1. One stage-count series per FUNNEL_STAGES entry, from real contacts.
  const stages: StageSeries[] = [];
  for (const stageDef of FUNNEL_STAGES) {
    const { results } = await fetchContactsByStage(season, stageDef.leadStatusValue);
    const dates = results
      .map((r: any) => r.properties?.createdate)
      .filter(Boolean)
      .map((d: string) => new Date(d));
    stages.push({
      stageKey: stageDef.key,
      label: stageDef.label,
      points: datesToWeeklyPoints(dates, season),
    });
  }

  // 2. Deals: Closed Won / Closed Lost (real outcomes, not simulated) plus
  // all-pipeline "Deals Created".
  const wonDeals = await fetchDealsByStage("Closed won");
  const lostDeals = await fetchDealsByStage(DEAL_STAGE_CLOSED_LOST);
  const allDeals = await fetchAllDealsInPipeline();

  const wonPoints = datesToWeeklyPoints(
    wonDeals.results.map((d: any) => new Date(d.properties?.createdate)).filter((d: Date) => !isNaN(d.getTime())),
    season
  );
  const lostPoints = datesToWeeklyPoints(
    lostDeals.results.map((d: any) => new Date(d.properties?.createdate)).filter((d: Date) => !isNaN(d.getTime())),
    season
  );
  const dealsCreatedPoints = datesToWeeklyPoints(
    allDeals.results.map((d: any) => new Date(d.properties?.createdate)).filter((d: Date) => !isNaN(d.getTime())),
    season
  );

  const monthlyWon = toMonthlyPoints(wonPoints);
  const monthlyLost = toMonthlyPoints(lostPoints);
  const dealsMonthly = monthlyWon.map((m) => {
    const lostMatch = monthlyLost.find((l) => l.monthIndex === m.monthIndex && l.year === m.year);
    return { monthIndex: m.monthIndex, monthLabel: m.monthLabel, year: m.year, won: m.value, lost: lostMatch?.value ?? 0 };
  });
  const totalWon = dealsMonthly.reduce((s, m) => s + m.won, 0);
  const totalLost = dealsMonthly.reduce((s, m) => s + m.lost, 0);
  const currentYearLostSorted = lostPoints.filter((p) => p.year === currentYear).sort((a, b) => a.weekOfSeason - b.weekOfSeason);
  const currentYearWonSorted = wonPoints.filter((p) => p.year === currentYear).sort((a, b) => a.weekOfSeason - b.weekOfSeason);
  const thisWeekLost = currentYearLostSorted.at(-1)?.value ?? 0;
  const lastWeekLost = currentYearLostSorted.at(-2)?.value ?? 0;
  const thisWeekWon = currentYearWonSorted.at(-1)?.value ?? 0;
  const lastWeekWon = currentYearWonSorted.at(-2)?.value ?? 0;

  const deals: DealsBreakdown = {
    monthly: dealsMonthly,
    totalWon,
    totalLost,
    winRate: totalWon / (totalWon + totalLost || 1),
    thisWeekWon,
    lastWeekWon,
    thisWeekLost,
    lastWeekLost,
    weekOverWeekLostDelta: thisWeekLost - lastWeekLost,
  };

  // 3. Meetings: booked (all) vs completed (per form-association check).
  const allMeetings = await fetchMeetings();
  const meetingDates = (m: any) => {
    const raw = m.properties?.hs_meeting_start_time;
    return raw ? new Date(raw) : null;
  };
  const bookedDates = allMeetings.map(meetingDates).filter((d): d is Date => d !== null && !isNaN(d.getTime()));
  const completedDates = allMeetings
    .filter((m: any) => m.completed)
    .map(meetingDates)
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

  const weeklyBookedPoints = datesToWeeklyPoints(bookedDates, season);
  const weeklyCompletedPoints = datesToWeeklyPoints(completedDates, season);
  const totalBooked = weeklyBookedPoints.filter((p) => p.year === currentYear).reduce((s, p) => s + p.value, 0);
  const totalCompleted = weeklyCompletedPoints.filter((p) => p.year === currentYear).reduce((s, p) => s + p.value, 0);

  const meetings: MeetingsBreakdown = {
    monthlyBooked: weeklyBookedPoints,
    monthlyCompleted: weeklyCompletedPoints,
    totalBooked,
    totalCompleted,
    completionRate: totalCompleted / (totalBooked || 1),
  };

  // 4. Pacing and funnel drip - identical logic to mock data, shared module.
  const pacing = computePacing(season, stages, currentYear);
  const funnelDrip = computeFunnelDrip(stages, currentYear);

  return {
    season,
    years,
    stages,
    extras: {
      dealsCreated: { stageKey: "deals_created", label: "Deals Created", points: dealsCreatedPoints },
      meetingsBooked: { stageKey: "meetings_booked", label: "Meetings Booked", points: weeklyBookedPoints },
      meetingsCompleted: { stageKey: "meetings_completed", label: "Meetings Completed", points: weeklyCompletedPoints },
    },
    pacing,
    funnelDrip,
    deals,
    meetings,
  };
}

export async function getLiveAttribution(): Promise<AttributionResponse> {
  // TODO: implement once UTM property names are confirmed with the team
  // (see config/properties.ts UTM_PROPERTIES - currently placeholders).
  // Priority rule to apply per-contact: use UTM source if present and
  // non-empty, else fall back to HEARD_ABOUT_PROPERTY value.
  //
  // Also needs leadSources (Tally Quiz / Newsletter / Meta Ad Form counts
  // for "Lead" stage contacts) - see config/properties.ts LEAD_SOURCE_VALUES
  // for the still-unconfirmed classification question.
  throw new Error("getLiveAttribution is not implemented yet — see TODOs in this file.");
}
