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
} from "@/config/properties";
import type { AttributionResponse, FunnelResponse, Season } from "@/lib/types";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

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
  // TODO: implement full live aggregation once credentials are available:
  // 1. For each FUNNEL_STAGES entry, call fetchContactsByStage and bucket
  //    results by week (using createdate) and year.
  // 2. Call fetchDealsByStage for each mapped dealStageValue.
  // 3. Call fetchMeetings, split into booked (all) vs completed (per form
  //    association) vs no-show/canceled.
  // 4. Assemble into the FunnelResponse shape (see lib/types.ts) - same
  //    shape the mock data returns, so downstream UI code doesn't change.
  //    This now also includes funnelDrip (stage-to-stage conversion),
  //    deals (won vs lost by month), and meetings (booked vs completed
  //    with a completion rate) - see lib/mockData.ts computeFunnelDrip /
  //    computeDealsBreakdown / computeMeetingsBreakdown for the exact
  //    aggregation logic to mirror against live data.
  throw new Error(
    "getLiveFunnel is not implemented yet — set USE_MOCK_DATA=true, or finish wiring this " +
      "function once HubSpot credentials are confirmed working (see TODOs in this file)."
  );
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
