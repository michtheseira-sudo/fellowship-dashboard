import { FUNNEL_STAGES, YEARS_TRACKED } from "@/config/properties";
import { dateForWeekOfSeason, currentAndPreviousWeekBounds } from "@/lib/weeks";
import { toMonthlyPoints } from "@/lib/months";
import { computePacing, computeFunnelDrip, SEASON_LENGTH_WEEKS } from "@/lib/funnelAggregation";
import type {
  AttributionResponse,
  DealsBreakdown,
  FunnelResponse,
  MeetingsBreakdown,
  Season,
  StageSeries,
  WebsiteResponse,
  WeeklyPoint,
} from "@/lib/types";
import goalsConfig from "@/config/goals.json";

// Small seeded PRNG so mock data is stable across requests, not random noise
// on every reload.
function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Roughly models a funnel: each stage retains a shrinking % of the previous.
const STAGE_RETENTION: Record<string, number> = {
  lead: 1,
  new_candidate: 0.62,
  scheduled_interview: 0.7,
  accepted_fellow: 0.55,
  booked_fellow: 0.75,
  paying_fellow: 0.92,
  confirmed_fellow: 0.97,
  alumni: 0.0, // populated only for past, fully-completed seasons
};

// Year-over-year growth factor applied to top-of-funnel volume, so 2025 > 2024
// and 2026 tracks slightly ahead of 2025 (typical growing-program pattern).
const YEAR_GROWTH: Record<number, number> = { 2024: 0.82, 2025: 1.0, 2026: 1.12 };

function buildWeeklySeries(
  season: Season,
  year: number,
  baseWeeklyVolume: number,
  rand: () => number,
  currentWeekCap?: number
): WeeklyPoint[] {
  const points: WeeklyPoint[] = [];
  const weeksToGenerate = currentWeekCap ?? SEASON_LENGTH_WEEKS;
  for (let w = 1; w <= weeksToGenerate; w++) {
    // Ramp shape: builds up mid-season, tapers near deadline.
    const rampShape = Math.sin((Math.PI * w) / SEASON_LENGTH_WEEKS) + 0.4;
    const noise = 0.85 + rand() * 0.3;
    const value = Math.max(0, Math.round(baseWeeklyVolume * rampShape * noise));
    const date = dateForWeekOfSeason(w, season as "Summer" | "Winter", year);
    points.push({
      weekOfSeason: w,
      weekStartDate: date.toISOString().slice(0, 10),
      year,
      value,
    });
  }
  return points;
}

function currentWeekCapFor(season: Season, year: number): number | undefined {
  const now = new Date();
  const currentYear = now.getFullYear();
  if (year < currentYear) return undefined; // full past season, generate all weeks
  if (year > currentYear) return 0; // future season, no data yet
  // Current year: cap at roughly "now" so the chart doesn't show fabricated future weeks.
  const weekIntoYear = Math.min(
    SEASON_LENGTH_WEEKS,
    Math.max(1, Math.round((now.getMonth() * 4.3 + now.getDate() / 7) % SEASON_LENGTH_WEEKS) + 3)
  );
  return weekIntoYear;
}

export function getMockFunnel(season: Season): FunnelResponse {
  const years = [...YEARS_TRACKED];
  const stages: StageSeries[] = [];

  for (const stageDef of FUNNEL_STAGES) {
    const rand = seededRandom(stageDef.key.length * 977 + season.length * 31);
    const baseVolumeByStage: Record<string, number> = {
      lead: 140,
      new_candidate: 85,
      scheduled_interview: 55,
      accepted_fellow: 30,
      booked_fellow: 22,
      paying_fellow: 20,
      confirmed_fellow: 19,
      alumni: 0,
    };
    const base = baseVolumeByStage[stageDef.key] ?? 10;

    let allPoints: WeeklyPoint[] = [];
    for (const year of years) {
      const cap = currentWeekCapFor(season, year);
      if (cap === 0) continue;
      const yearBase = base * (YEAR_GROWTH[year] ?? 1);
      allPoints = allPoints.concat(buildWeeklySeries(season, year, yearBase, rand, cap));
    }
    stages.push({ stageKey: stageDef.key, label: stageDef.label, points: allPoints });
  }

  const dealsRand = seededRandom(4242);
  const meetingsBookedRand = seededRandom(1313);
  const meetingsCompletedRand = seededRandom(7171);

  let dealsCreatedPoints: WeeklyPoint[] = [];
  let meetingsBookedPoints: WeeklyPoint[] = [];
  let meetingsCompletedPoints: WeeklyPoint[] = [];

  for (const year of years) {
    const cap = currentWeekCapFor(season, year);
    if (cap === 0) continue;
    const growth = YEAR_GROWTH[year] ?? 1;
    dealsCreatedPoints = dealsCreatedPoints.concat(
      buildWeeklySeries(season, year, 24 * growth, dealsRand, cap)
    );
    meetingsBookedPoints = meetingsBookedPoints.concat(
      buildWeeklySeries(season, year, 48 * growth, meetingsBookedRand, cap)
    );
    meetingsCompletedPoints = meetingsCompletedPoints.concat(
      buildWeeklySeries(season, year, 36 * growth, meetingsCompletedRand, cap)
    );
  }

  const pacing = computePacing(season, stages);
  const funnelDrip = computeFunnelDrip(stages);
  const dealsRand2 = seededRandom(8181);
  const deals = computeDealsBreakdown(dealsCreatedPoints, dealsRand2);
  const meetings = computeMeetingsBreakdown(meetingsBookedPoints, meetingsCompletedPoints);

  return {
    season,
    years,
    stages,
    extras: {
      dealsCreated: { stageKey: "deals_created", label: "Deals Created", points: dealsCreatedPoints },
      meetingsBooked: { stageKey: "meetings_booked", label: "Meetings Booked", points: meetingsBookedPoints },
      meetingsCompleted: {
        stageKey: "meetings_completed",
        label: "Meetings Completed",
        points: meetingsCompletedPoints,
      },
    },
    pacing,
    funnelDrip,
    deals,
    meetings,
  };
}

function computeDealsBreakdown(dealsCreatedPoints: WeeklyPoint[], rand: () => number): DealsBreakdown {
  // Split at the WEEKLY level - the monthly chart aggregates this up, but
  // splitting monthly-only would make "this week's Closed Lost count"
  // impossible to report accurately. Win rate still varies week to week
  // around a ~78% baseline.
  const weeklyWon: WeeklyPoint[] = [];
  const weeklyLost: WeeklyPoint[] = [];
  for (const p of dealsCreatedPoints) {
    const winRate = 0.72 + rand() * 0.14;
    const won = Math.round(p.value * winRate);
    const lost = p.value - won;
    weeklyWon.push({ ...p, value: won });
    weeklyLost.push({ ...p, value: lost });
  }

  const monthlyWon = toMonthlyPoints(weeklyWon);
  const monthlyLost = toMonthlyPoints(weeklyLost);
  const monthly = monthlyWon.map((m) => {
    const lostMatch = monthlyLost.find((l) => l.monthIndex === m.monthIndex && l.year === m.year);
    return { monthIndex: m.monthIndex, monthLabel: m.monthLabel, year: m.year, won: m.value, lost: lostMatch?.value ?? 0 };
  });
  const totalWon = monthly.reduce((s, m) => s + m.won, 0);
  const totalLost = monthly.reduce((s, m) => s + m.lost, 0);

  const currentYear = new Date().getFullYear();
  const sortByWeek = (a: WeeklyPoint, b: WeeklyPoint) => a.weekOfSeason - b.weekOfSeason;
  const currentYearLost = weeklyLost.filter((p) => p.year === currentYear).sort(sortByWeek);
  const currentYearWon = weeklyWon.filter((p) => p.year === currentYear).sort(sortByWeek);
  const thisWeekLost = currentYearLost.at(-1)?.value ?? 0;
  const lastWeekLost = currentYearLost.at(-2)?.value ?? 0;
  const thisWeekWon = currentYearWon.at(-1)?.value ?? 0;
  const lastWeekWon = currentYearWon.at(-2)?.value ?? 0;

  return {
    monthly,
    totalWon,
    totalLost,
    winRate: totalWon / (totalWon + totalLost || 1),
    thisWeekWon,
    lastWeekWon,
    thisWeekLost,
    lastWeekLost,
    weekOverWeekLostDelta: thisWeekLost - lastWeekLost,
  };
}

function computeMeetingsBreakdown(booked: WeeklyPoint[], completed: WeeklyPoint[]): MeetingsBreakdown {
  const currentYear = new Date().getFullYear();
  const totalBooked = booked.filter((p) => p.year === currentYear).reduce((s, p) => s + p.value, 0);
  const totalCompleted = completed.filter((p) => p.year === currentYear).reduce((s, p) => s + p.value, 0);
  return {
    monthlyBooked: booked,
    monthlyCompleted: completed,
    totalBooked,
    totalCompleted,
    completionRate: totalCompleted / (totalBooked || 1),
  };
}

export function getMockWebsite(): WebsiteResponse {
  const rand = seededRandom(555);
  const visitorsOverTime: WeeklyPoint[] = buildWeeklySeries("Summer", 2026, 2100, rand, 12);

  return {
    visitorsOverTime,
    avgSessionDurationSeconds: 154,
    topPages: [
      { path: "/apply", views: 8420 },
      { path: "/", views: 7110 },
      { path: "/programs/pre-health-fellowship", views: 5230 },
      { path: "/faq", views: 3190 },
      { path: "/testimonials", views: 2510 },
    ],
    underperformingPages: [
      { path: "/blog/scholarship-guide-2024", views: 42, threshold: 100 },
      { path: "/programs/legacy-track", views: 18, threshold: 100 },
      { path: "/partners", views: 61, threshold: 100 },
    ],
    geography: [
      { country: "United States", sessions: 12400 },
      { country: "Portugal", sessions: 3100 },
      { country: "United Kingdom", sessions: 2450 },
      { country: "Canada", sessions: 1890 },
      { country: "India", sessions: 1320 },
    ],
    topKeywords: [
      { keyword: "pre health fellowship abroad", clicks: 940 },
      { keyword: "clinical shadowing program", clicks: 610 },
      { keyword: "gap year premed program", clicks: 505 },
      { keyword: "medical fellowship summer", clicks: 388 },
    ],
    shopify: {
      checkoutStarts: 640,
      checkoutCompletions: 512,
      topProductViews: [
        { product: "Summer 2026 - Deposit", views: 3100 },
        { product: "Summer 2026 - Full Payment", views: 1400 },
        { product: "Winter 2026 - Deposit", views: 980 },
      ],
    },
  };
}

export function getMockAttribution(): AttributionResponse {
  const sources = ["Organic Search", "Paid Social", "Influencer", "Referral", "Direct", "Email"];
  const rand = seededRandom(999);

  const bySource = sources.map((source) => ({
    source,
    applicants: Math.round(120 + rand() * 380),
  }));

  const bySourceByStage = sources.map((source) => {
    const applicants = bySource.find((s) => s.source === source)!.applicants;
    const accepted = Math.round(applicants * (0.35 + rand() * 0.15));
    const booked = Math.round(accepted * (0.65 + rand() * 0.15));
    const paying = Math.round(booked * (0.9 + rand() * 0.08));
    const confirmed = Math.round(paying * (0.95 + rand() * 0.04));
    return {
      source,
      new_candidate: applicants,
      accepted_fellow: accepted,
      booked_fellow: booked,
      paying_fellow: paying,
      confirmed_fellow: confirmed,
    };
  });

  // Lead source split - top-of-funnel, pre-application. Roughly weighted
  // toward the quiz (highest-intent top-of-funnel channel), then meta ads,
  // then newsletter as the smallest of the three.
  const leadRand = seededRandom(4711);
  const totalLeads = Math.round(1800 + leadRand() * 400);
  const tallyShare = 0.5 + leadRand() * 0.08;
  const metaShare = 0.3 + leadRand() * 0.06;
  const tallyCount = Math.round(totalLeads * tallyShare);
  const metaCount = Math.round(totalLeads * metaShare);
  const newsletterCount = totalLeads - tallyCount - metaCount;
  const leadSources = [
    { source: "Tally Quiz", count: tallyCount },
    { source: "Meta Ad Form", count: metaCount },
    { source: "Newsletter", count: newsletterCount },
  ];

  return {
    bySource,
    bySourceByStage,
    leadSources,
    utmCoverage: {
      withUtm: 1180,
      fallbackHeardAbout: 640,
      neither: 90,
    },
  };
}
