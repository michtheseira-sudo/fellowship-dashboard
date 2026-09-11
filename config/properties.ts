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
// UTM property names not yet confirmed with the team — placeholders below,
// flagged so they're easy to find and swap once confirmed.
export const UTM_PROPERTIES = {
  source: "utm_source", // TODO: confirm exact HubSpot internal property name
  medium: "utm_medium", // TODO: confirm
  campaign: "utm_campaign", // TODO: confirm
};
export const HEARD_ABOUT_PROPERTY = "heard_about";
// Priority rule: use UTM data if present, else fall back to heard_about.

// ---- Lead source (top-of-funnel, pre-application) ----
// "Lead" stage contacts haven't applied yet - they came in through one of
// three channels, per the original build brief.
export const LEAD_SOURCE_VALUES = ["Tally Quiz", "Newsletter", "Meta Ad Form"] as const;
// TODO: confirm with the team which HubSpot property or form-submission
// association actually identifies which of these three a given "Lead"
// stage contact came through. Likely candidates: a dedicated lead-source
// property set at form submission, or (like the meeting-completion check
// in lib/providers/hubspot.ts) inferring it from which specific form the
// contact's earliest submission is associated with.

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
