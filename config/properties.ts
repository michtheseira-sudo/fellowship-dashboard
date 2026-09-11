/**
 * Central source of truth for HubSpot property names and exact values.
 * Confirmed with the team on 2026-09-10. Update here (not in query logic)
 * if HubSpot property values ever change.
 */

// ---- Lead status <> Deal stage sync ----
// lead_status is the internal property name on the Contact object.
// Deal stage is on the associated Deal, within this specific pipeline -
// set DEAL_PIPELINE_ID in .env.local once confirmed with the team.
export const LEAD_STATUS_PROPERTY = "lead_status";
export const DEAL_PIPELINE_ID = process.env.DEAL_PIPELINE_ID ?? "";

export const FUNNEL_STAGES = [
  {
    key: "lead",
    label: "Lead",
    leadStatusValue: "Lead",
    dealStageValue: null as string | null,
    note: "No application yet — meta ad form, newsletter form, or Tally quiz.",
  },
  {
    key: "new_candidate",
    label: "New Candidate",
    leadStatusValue: "New candidate",
    dealStageValue: null,
    note: "Applied.",
  },
  {
    key: "scheduled_interview",
    label: "Scheduled Interview",
    leadStatusValue: "Scheduled Interview",
    dealStageValue: null,
    note: "Booked an orientation session.",
  },
  {
    key: "accepted_fellow",
    label: "Accepted Fellow",
    leadStatusValue: "Accepted Fellow",
    dealStageValue: "Invited to enroll",
    note: "Accepted into the program.",
  },
  {
    key: "booked_fellow",
    label: "Booked Fellow",
    leadStatusValue: "Booked Fellow",
    dealStageValue: "Paid deposit",
    note: "Paid €300 deposit.",
  },
  {
    key: "paying_fellow",
    label: "Paying Fellow",
    leadStatusValue: "Paying Fellow",
    dealStageValue: "Paid installment",
    note: "Paid first installment.",
  },
  {
    key: "confirmed_fellow",
    label: "Confirmed Fellow",
    leadStatusValue: "Confirmed Fellow",
    dealStageValue: "Closed won",
    note: "Fully paid.",
  },
  {
    key: "alumni",
    label: "Alumni",
    leadStatusValue: "Alumni",
    dealStageValue: null,
    note: "Finished program.",
  },
] as const;

export const DEAL_STAGE_CLOSED_LOST = "Closed lost";
// Deal created, no response, rejected, or declined offer.

// ---- Season / Year ----
export const SEASON_PROPERTY = "season";
export const SEASON_VALUES = ["Summer", "Winter", "Undecided"] as const;

// No dedicated "year" property confirmed yet — derive year from the
// application/form-submission date until a clean property is confirmed.
// TODO: replace with a direct property read if/when one exists.
export const YEAR_SOURCE = "derived_from_application_date" as const;
export const YEARS_TRACKED = [2024, 2025, 2026] as const;

// ---- Attribution ----
// Confirmed with the team 2026-09-11:
export const INITIAL_UTM_SOURCE_PROPERTY = "initial_utm_source"; // what we tracked via UTM
export const HEARD_ABOUT_PROPERTY = "heard_about"; // what the contact says on the form
// Priority rule: use initial_utm_source if present, else fall back to heard_about.

// ---- Lead source (top-of-funnel, pre-application) ----
// "Lead" stage contacts haven't applied yet - confirmed with the team they
// come through exactly one of these two forms first.
export const LEAD_SOURCE_FORM_NAMES = {
  metaAds: "Meta Ads Lead",
  newsletter: "Newsletter Fellowship New Website",
} as const;
export const LEAD_SOURCE_OTHER_LABEL = "Other / Unknown";
// Classification property: HubSpot's standard "first_conversion_event_name"
// contact property records the name of whichever form a contact first
// submitted. This is a very standard HubSpot behavior, but NOT something
// the team has explicitly confirmed - if this comes back empty or doesn't
// match the two form names above, flag it back; the fallback would be the
// same associations-based approach used for meeting-completion below.
export const FIRST_CONVERSION_EVENT_PROPERTY = "first_conversion_event_name";

// ---- Meetings ----
// Meetings are logged as native HubSpot Meeting engagements associated
// with a contact, not a custom property.
export const MEETING_COMPLETION_FORM_NAMES = [
  "Pre-Health Interview Form 2025",
  "Retired 2025 Pre-Health Interview Form",
  "Orientation Session Form First Round Form",
  "NEW ORIENTATION SESSION FORM 09.09.26",
];
// If a meeting has one of the above forms associated, treat it as "completed / showed up".

export const MEETING_OUTCOME_NO_SHOW_VALUES = ["No-show", "Canceled"];
// Any other/no outcome + no associated form above = treat as "pending/unclassified".
