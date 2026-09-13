import {
  DEAL_PIPELINE_ID,
  DEAL_STAGE_CLOSED_LOST,
  FIRST_CONVERSION_EVENT_PROPERTY,
  FUNNEL_STAGES,
  HEARD_ABOUT_PROPERTY,
  INITIAL_UTM_SOURCE_PROPERTY,
  LEAD_SOURCE_FORM_NAMES,
  LEAD_SOURCE_OTHER_LABEL,
  LEAD_STATUS_PROPERTY,
  MEETING_COMPLETION_FORM_NAMES,
  MEETING_OUTCOME_NO_SHOW_VALUES,
  SEASON_PROPERTY,
  SEASON_VALUES,
  YEARS_TRACKED,
} from "@/config/properties";
import { weekOfSeason, dateForWeekOfSeason } from "@/lib/weeks";
import { toMonthlyPoints } from "@/lib/months";
import { computePacing, computeFunnelDrip } from "@/lib/funnelAggregation";
import type { ApplicationsBreakdown, AttributionResponse, DealsBreakdown, FunnelResponse, LeadTimeStats, MeetingsBreakdown, Season, StageSeries, WeeklyPoint } from "@/lib/types";

/**
 * HubSpot's Search API has a strict per-second ("SECONDLY") rate limit on
 * lower-tier plans - tighter than the general API limit. This sync job
 * makes many search calls in a short window (one per pipeline stage, plus
 * deals, plus several for attribution), so every one of them - not just
 * pagination within a single call - needs spacing to avoid 429s.
 */
const RATE_LIMIT_DELAY_MS = 550;
function rateLimitDelay() {
  return new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
}

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
 * Fetch every contact ID across ALL season values in ONE search (not one
 * call per season) - this is the expensive part of a sync (batch-reading
 * everyone's full history afterward), so doing the roster fetch once
 * instead of three times (Summer/Winter/Other) roughly triples the
 * savings compared to a naive per-season loop. Each contact comes back
 * tagged with its own season value so callers can split the group
 * locally afterward.
 */
async function fetchAllContactsRoster(): Promise<{ id: string; season: Season }[]> {
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`;
  const roster: { id: string; season: Season }[] = [];
  let after: string | undefined = undefined;
  const MAX_PAGES = 50; // safety cap (5,000 contacts)

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: SEASON_PROPERTY, operator: "IN", values: [...SEASON_VALUES] }] }],
      properties: ["hs_object_id", SEASON_PROPERTY],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`HubSpot contacts search (full roster) failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    for (const r of data.results ?? []) {
      const seasonValue = r.properties?.[SEASON_PROPERTY];
      if ((SEASON_VALUES as readonly string[]).includes(seasonValue)) {
        roster.push({ id: r.id, season: seasonValue as Season });
      }
      // A contact with a missing/unexpected season value is silently
      // skipped here - same as before, but worth knowing about if
      // application totals ever look low: it means some contacts have a
      // season value outside Summer/Winter/Other entirely.
    }

    after = data.paging?.next?.after;
    if (!after) break;
    await rateLimitDelay();
  }

  return roster;
}

/**
 * Batch-reads a list of contact IDs with their FULL history on
 * hs_lead_status (not just the current value) - this is what makes "ever
 * reached this stage" possible even after a contact has moved on or
 * closed lost. HubSpot's batch/read endpoint returns history newest-first
 * per contact; we sort it ascending here so "first time they hit stage X"
 * is a simple find().
 *
 * hs_lead_status has been in place well before this season (confirmed
 * with the team - it's the same field Stripe/deal-stage automation
 * writes to), so its history is trustworthy for this whole season. If a
 * future season predates when this field went live, this approach would
 * silently under-count early stages for that season only - worth
 * re-checking if a much older season is ever added.
 */
async function fetchLeadStatusHistory(ids: string[]): Promise<Map<string, { value: string; timestamp: string }[]>> {
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/batch/read`;
  const historyByContact = new Map<string, { value: string; timestamp: string }[]>();
  const CHUNK_SIZE = 100; // HubSpot's batch/read max per request

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const body = {
      inputs: chunk.map((id) => ({ id })),
      propertiesWithHistory: [LEAD_STATUS_PROPERTY],
    };
    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`HubSpot contacts batch/read (lead status history) failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    for (const contact of data.results ?? []) {
      const rawHistory = contact.propertiesWithHistory?.[LEAD_STATUS_PROPERTY] ?? [];
      const sorted = rawHistory
        .map((h: any) => ({ value: h.value, timestamp: h.timestamp }))
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      historyByContact.set(contact.id, sorted);
    }
    if (i + CHUNK_SIZE < ids.length) await rateLimitDelay();
  }

  return historyByContact;
}

/**
 * Builds stage cohort data for EVERY season in one shared HubSpot pass:
 * one combined roster fetch (Summer + Winter + Other together, not three
 * separate season-scoped fetches) and one shared history batch-read,
 * split into per-season buckets afterward in memory. For each season,
 * this gives one Date[] per funnel stage: the date each contact FIRST
 * reached that stage, for every contact who ever reached it - not just
 * contacts currently sitting there. A contact who was Accepted, then
 * Booked, then later Closed Lost still counts toward Accepted (and
 * Booked) here, matching how HubSpot's own "ever equal to" segment
 * filter would report it.
 *
 * This also gives us the "Other" (undecided-season) bucket essentially
 * for free - useful for the Applications breakdown even though Other
 * doesn't get its own goal-pacing cards (see getLiveApplications below).
 */
async function buildCohortsForAllSeasons(): Promise<Map<Season, Map<string, Date[]>>> {
  const roster = await fetchAllContactsRoster();
  await rateLimitDelay();
  const historyByContact = await fetchLeadStatusHistory(roster.map((r) => r.id));

  const cohortsBySeason = new Map<Season, Map<string, Date[]>>();
  for (const season of SEASON_VALUES) {
    const datesByStage = new Map<string, Date[]>();
    for (const stageDef of FUNNEL_STAGES) datesByStage.set(stageDef.key, []);
    cohortsBySeason.set(season, datesByStage);
  }

  for (const { id, season } of roster) {
    const history = historyByContact.get(id);
    if (!history) continue;
    const datesByStage = cohortsBySeason.get(season)!;
    for (const stageDef of FUNNEL_STAGES) {
      const firstEntry = history.find((h) => h.value === stageDef.leadStatusValue);
      if (firstEntry) datesByStage.get(stageDef.key)!.push(new Date(firstEntry.timestamp));
    }
  }

  return cohortsBySeason;
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
    await rateLimitDelay();
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
    await rateLimitDelay();
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
    await rateLimitDelay();
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
    await rateLimitDelay();
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

/**
 * Builds one season's full FunnelResponse from already-fetched shared
 * data (cohort dates, deals, meetings) - no HubSpot calls happen in here,
 * it's pure local bucketing/aggregation. Called once per season from
 * getLiveFunnelBundle below.
 */
function buildFunnelResponseForSeason(
  season: Season,
  cohortDatesByStage: Map<string, Date[]>,
  wonDeals: { results: any[] },
  lostDeals: { results: any[] },
  allDeals: { results: any[] },
  allMeetings: any[],
  currentYear: number,
  years: number[]
): FunnelResponse {
  const stages: StageSeries[] = FUNNEL_STAGES.map((stageDef) => ({
    stageKey: stageDef.key,
    label: stageDef.label,
    points: datesToWeeklyPoints(cohortDatesByStage.get(stageDef.key) ?? [], season),
  }));

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

/**
 * The single entry point the sync job calls for funnel data. Fetches
 * cohorts (all 3 season values), deals, and meetings EXACTLY ONCE each -
 * none of these HubSpot queries are actually season-scoped server-side
 * (deals/meetings never were; cohorts now cover all seasons in one pass
 * too), so building Summer and Winter as two separate top-to-bottom live
 * fetches was redoing the same work twice for no reason. Also returns
 * the Applications breakdown (Summer/Winter/Other application counts)
 * as a byproduct of the same cohort data, at no extra HubSpot cost.
 */
export async function getLiveFunnelBundle(): Promise<{
  summer: FunnelResponse;
  winter: FunnelResponse;
  applications: ApplicationsBreakdown;
}> {
  const currentYear = new Date().getFullYear();
  const years = [...YEARS_TRACKED];

  const cohortsBySeason = await buildCohortsForAllSeasons();
  await rateLimitDelay();

  // Deals: Closed Won / Closed Lost (real outcomes, not simulated) plus
  // all-pipeline "Deals Created". Closed Won's stage ID comes from
  // FUNNEL_STAGES (confirmed_fellow) rather than being hardcoded here -
  // this exact pattern (a second hardcoded copy silently drifting from
  // the confirmed value) already caused two other bugs today.
  const closedWonStageId = FUNNEL_STAGES.find((s) => s.key === "confirmed_fellow")!.dealStageValue!;
  const wonDeals = await fetchDealsByStage(closedWonStageId);
  await rateLimitDelay();
  const lostDeals = await fetchDealsByStage(DEAL_STAGE_CLOSED_LOST);
  await rateLimitDelay();
  const allDeals = await fetchAllDealsInPipeline();
  await rateLimitDelay();

  // Meetings: booked (all) vs completed (per form-association check).
  const allMeetings = await fetchMeetings();

  const summer = buildFunnelResponseForSeason(
    "Summer",
    cohortsBySeason.get("Summer")!,
    wonDeals,
    lostDeals,
    allDeals,
    allMeetings,
    currentYear,
    years
  );
  const winter = buildFunnelResponseForSeason(
    "Winter",
    cohortsBySeason.get("Winter")!,
    wonDeals,
    lostDeals,
    allDeals,
    allMeetings,
    currentYear,
    years
  );

  const applications: ApplicationsBreakdown = {
    summer: cohortsBySeason.get("Summer")!.get("new_candidate")?.length ?? 0,
    winter: cohortsBySeason.get("Winter")!.get("new_candidate")?.length ?? 0,
    other: cohortsBySeason.get("Other")!.get("new_candidate")?.length ?? 0,
    asOf: new Date().toISOString(),
  };

  return { summer, winter, applications };
}

/**
 * Fetches ALL contacts (no season filter) with a given lead_status,
 * requesting whatever extra properties the caller needs. Used for
 * attribution, which aggregates across seasons and only needs current
 * status (unlike the funnel tab, which now tracks full stage history -
 * see buildCohortsForAllSeasons - to capture contacts who moved on or
 * closed lost).
 */
async function fetchAllContactsByLeadStatus(leadStatusValue: string, extraProperties: string[]) {
  const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`;
  const properties = [LEAD_STATUS_PROPERTY, ...extraProperties];
  const allResults: any[] = [];
  let after: string | undefined = undefined;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: LEAD_STATUS_PROPERTY, operator: "EQ", value: leadStatusValue }] }],
      properties,
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(url, { method: "POST", headers: hubspotHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(
        `HubSpot contacts search (attribution, ${leadStatusValue}) failed: ${res.status} ${await res.text()}`
      );
    }
    const data = await res.json();
    allResults.push(...(data.results ?? []));

    after = data.paging?.next?.after;
    if (!after) break;
    await rateLimitDelay();
  }

  return allResults;
}

/** Priority rule: initial_utm_source if present, else heard_about, else "Unknown". */
function resolveSource(contact: any): { source: string; hadUtm: boolean; hadHeardAbout: boolean } {
  const utm = contact.properties?.[INITIAL_UTM_SOURCE_PROPERTY]?.trim();
  const heardAbout = contact.properties?.[HEARD_ABOUT_PROPERTY]?.trim();
  if (utm) return { source: utm, hadUtm: true, hadHeardAbout: !!heardAbout };
  if (heardAbout) return { source: heardAbout, hadUtm: false, hadHeardAbout: true };
  return { source: "Unknown", hadUtm: false, hadHeardAbout: false };
}

const ATTRIBUTION_STAGE_KEYS = ["new_candidate", "accepted_fellow", "booked_fellow", "paying_fellow", "confirmed_fellow"] as const;
// Derived from FUNNEL_STAGES rather than hardcoded here - this exact
// duplication (a second, separately-hardcoded "New candidate" that also
// turned out wrong) is what caused the attribution 400 even after fixing
// FUNNEL_STAGES itself. Single source of truth now.
const ATTRIBUTION_STAGES = ATTRIBUTION_STAGE_KEYS.map((key) => {
  const stage = FUNNEL_STAGES.find((s) => s.key === key);
  if (!stage) throw new Error(`FUNNEL_STAGES is missing an entry for "${key}"`);
  return { key, leadStatusValue: stage.leadStatusValue };
});

const LEAD_TIME_PROPERTIES = ["hs_analytics_first_timestamp", "first_conversion_date"];
const LEAD_TIME_BUCKET_ORDER = ["Same day", "1-3 days", "4-7 days", "1-2 weeks", "2-4 weeks", "1+ months"];

function bucketLeadTimeDays(days: number): string {
  if (days <= 0) return "Same day";
  if (days <= 3) return "1-3 days";
  if (days <= 7) return "4-7 days";
  if (days <= 14) return "1-2 weeks";
  if (days <= 30) return "2-4 weeks";
  return "1+ months";
}

/**
 * Time from a contact's first-ever site visit (hs_analytics_first_timestamp,
 * a standard HubSpot analytics property) to their first form submission
 * (first_conversion_date). Pulled across every funnel stage - not season-
 * scoped, since this is about browsing behavior before conversion, not
 * program performance.
 */
async function computeLeadTimeToFirstConversion(): Promise<LeadTimeStats> {
  const allStageValues = FUNNEL_STAGES.map((s) => s.leadStatusValue);
  const results: any[][] = [];
  for (const v of allStageValues) {
    results.push(await fetchAllContactsByLeadStatus(v, LEAD_TIME_PROPERTIES));
    await rateLimitDelay();
  }
  const contacts = results.flat();

  const days: number[] = [];
  for (const c of contacts) {
    const firstSeen = c.properties?.hs_analytics_first_timestamp;
    const converted = c.properties?.first_conversion_date;
    if (!firstSeen || !converted) continue;
    const t1 = new Date(firstSeen).getTime();
    const t2 = new Date(converted).getTime();
    if (isNaN(t1) || isNaN(t2)) continue;
    const diffDays = Math.floor((t2 - t1) / 86400000);
    if (diffDays < 0) continue; // guards against bad/backfilled data
    days.push(diffDays);
  }

  const bucketCounts: Record<string, number> = {};
  for (const label of LEAD_TIME_BUCKET_ORDER) bucketCounts[label] = 0;
  for (const d of days) bucketCounts[bucketLeadTimeDays(d)]++;
  const distribution = LEAD_TIME_BUCKET_ORDER.map((label) => ({ label, count: bucketCounts[label] }));

  if (days.length === 0) {
    return { averageDays: 0, medianDays: 0, sampleSize: 0, distribution };
  }

  const averageDays = Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10;
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDays =
    sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;

  return { averageDays, medianDays, sampleSize: days.length, distribution };
}

export async function getLiveAttribution(): Promise<AttributionResponse> {
  const extraProps = [INITIAL_UTM_SOURCE_PROPERTY, HEARD_ABOUT_PROPERTY];

  // Fetch every stage's contacts sequentially, not concurrently - firing
  // all 5 at once was almost certainly the main trigger for HubSpot's
  // "secondly" rate limit.
  const stageResults: { key: string; contacts: ReturnType<typeof resolveSource>[] }[] = [];
  for (const stage of ATTRIBUTION_STAGES) {
    const contacts = await fetchAllContactsByLeadStatus(stage.leadStatusValue, extraProps);
    stageResults.push({ key: stage.key, contacts: contacts.map(resolveSource) });
    await rateLimitDelay();
  }

  const allSources = new Set<string>();
  for (const s of stageResults) for (const c of s.contacts) allSources.add(c.source);

  const countsByStage: Record<string, Record<string, number>> = {};
  for (const s of stageResults) {
    const counts: Record<string, number> = {};
    for (const source of allSources) counts[source] = 0;
    for (const c of s.contacts) counts[c.source] += 1;
    countsByStage[s.key] = counts;
  }

  const bySourceByStage = Array.from(allSources).map((source) => ({
    source,
    new_candidate: countsByStage.new_candidate[source] ?? 0,
    accepted_fellow: countsByStage.accepted_fellow[source] ?? 0,
    booked_fellow: countsByStage.booked_fellow[source] ?? 0,
    paying_fellow: countsByStage.paying_fellow[source] ?? 0,
    confirmed_fellow: countsByStage.confirmed_fellow[source] ?? 0,
  }));

  const bySource = bySourceByStage.map((row) => ({ source: row.source, applicants: row.new_candidate }));

  // UTM coverage is measured at the top of the funnel (New Candidate).
  const topOfFunnel = stageResults.find((s) => s.key === "new_candidate")?.contacts ?? [];
  const utmCoverage = {
    withUtm: topOfFunnel.filter((c) => c.hadUtm).length,
    fallbackHeardAbout: topOfFunnel.filter((c) => !c.hadUtm && c.hadHeardAbout).length,
    neither: topOfFunnel.filter((c) => !c.hadUtm && !c.hadHeardAbout).length,
  };

  // Lead sources: classify "Lead" stage contacts by first-form-submitted.
  const leadStageValue = FUNNEL_STAGES.find((s) => s.key === "lead")!.leadStatusValue;
  const leadContacts = await fetchAllContactsByLeadStatus(leadStageValue, [FIRST_CONVERSION_EVENT_PROPERTY]);
  let metaCount = 0;
  let newsletterCount = 0;
  let otherCount = 0;
  for (const contact of leadContacts) {
    const formName = contact.properties?.[FIRST_CONVERSION_EVENT_PROPERTY]?.trim();
    if (formName === LEAD_SOURCE_FORM_NAMES.metaAds) metaCount++;
    else if (formName === LEAD_SOURCE_FORM_NAMES.newsletter) newsletterCount++;
    else otherCount++;
  }
  const leadSources = [
    { source: LEAD_SOURCE_FORM_NAMES.metaAds, count: metaCount },
    { source: LEAD_SOURCE_FORM_NAMES.newsletter, count: newsletterCount },
    { source: LEAD_SOURCE_OTHER_LABEL, count: otherCount },
  ];

  const leadTimeToFirstConversion = await computeLeadTimeToFirstConversion();

  return { bySource, bySourceByStage, leadSources, utmCoverage, leadTimeToFirstConversion };
}
