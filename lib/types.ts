export type Season = "Summer" | "Winter" | "Other";

// Total applications split by season choice, INCLUDING people who haven't
// decided yet ("Other"). Deliberately separate from per-season goal
// pacing below - "Other" applicants don't count toward either season's
// goal until they resolve to Summer or Winter, but they still count as
// real applications and matter for total-momentum visibility.
export interface ApplicationsBreakdown {
  summer: number;
  winter: number;
  other: number;
  asOf: string;
}


export type FunnelStageKey =
  | "lead"
  | "new_candidate"
  | "scheduled_interview"
  | "accepted_fellow"
  | "booked_fellow"
  | "paying_fellow"
  | "confirmed_fellow"
  | "alumni";

export interface WeeklyPoint {
  weekOfSeason: number; // 1-indexed, aligned across years for overlay
  weekStartDate: string; // ISO date
  year: number;
  value: number;
}

export interface StageSeries {
  stageKey: FunnelStageKey | "deals_created" | "meetings_booked" | "meetings_completed";
  label: string;
  points: WeeklyPoint[];
}

export interface FunnelResponse {
  season: Season;
  years: number[];
  stages: StageSeries[];
  extras: {
    dealsCreated: StageSeries;
    meetingsBooked: StageSeries;
    meetingsCompleted: StageSeries;
  };
  pacing: PacingResult[];
  funnelDrip: FunnelDripStage[];
  deals: DealsBreakdown;
  meetings: MeetingsBreakdown;
}

export interface PacingResult {
  stageKey: string;
  label: string;
  target: number | null;
  actualToDate: number;
  projectedFinal: number | null;
  onPace: boolean | null; // null when no target set
  seasonDeadline: string | null; // ISO date, format with lib/dateFormat.ts for display
  thisWeekValue: number;
  lastWeekValue: number;
  weekOverWeekDelta: number; // thisWeekValue - lastWeekValue
}

export interface FunnelDripStage {
  stageKey: FunnelStageKey;
  label: string;
  count: number;
  pctOfFirstStage: number; // % of new_candidate count remaining at this stage
  pctOfPreviousStage: number | null; // conversion rate from the immediately prior drip stage
}

export interface DealsBreakdown {
  monthly: { monthIndex: number; monthLabel: string; year: number; won: number; lost: number }[];
  totalWon: number;
  totalLost: number;
  winRate: number; // won / (won + lost), 0-1
  thisWeekWon: number;
  lastWeekWon: number;
  thisWeekLost: number;
  lastWeekLost: number;
  weekOverWeekLostDelta: number; // thisWeekLost - lastWeekLost
}

export interface MeetingsBreakdown {
  monthlyBooked: WeeklyPoint[];
  monthlyCompleted: WeeklyPoint[];
  totalBooked: number;
  totalCompleted: number;
  completionRate: number; // completed / booked, 0-1
}

export interface WebsitePeriodStats {
  avgSessionDurationSeconds: number;
  topPages: { path: string; views: number }[];
  underperformingPages: { path: string; views: number; threshold: number }[];
  geography: { country: string; sessions: number }[];
  topKeywords: { keyword: string; clicks: number }[];
}

export interface WebsiteResponse {
  visitorsOverTime: WeeklyPoint[]; // real calendar weeks, real dates - last ~12 weeks
  thisWeek: WebsitePeriodStats;
  thisMonth: WebsitePeriodStats;
  shopify: {
    checkoutStarts: number;
    checkoutCompletions: number;
    topProductViews: { product: string; views: number }[];
  };
}

export interface LeadTimeBucket {
  label: string;
  count: number;
}

export interface LeadTimeStats {
  averageDays: number;
  medianDays: number;
  sampleSize: number;
  distribution: LeadTimeBucket[];
}

export interface AttributionResponse {
  bySource: { source: string; applicants: number }[];
  bySourceByStage: {
    source: string;
    new_candidate: number;
    accepted_fellow: number;
    booked_fellow: number;
    paying_fellow: number;
    confirmed_fellow: number;
  }[];
  utmCoverage: {
    withUtm: number;
    fallbackHeardAbout: number;
    neither: number;
  };
  leadSources: { source: string; count: number }[]; // Meta Ads Lead / Newsletter Fellowship New Website / Other
  leadTimeToFirstConversion: LeadTimeStats; // first site visit -> first form fill
}
