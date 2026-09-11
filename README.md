# Fellowship Program Dashboard

Internal dashboard: Program/Funnel KPIs (HubSpot), Website Statistics (GA4 + Shopify),
and Marketing Attribution (HubSpot). Built from the team's build brief, currently
running on **realistic mock data** so the app is fully clickable before any
credentials exist.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 — it redirects to the Funnel tab.

With `USE_MOCK_DATA=true` (the default), no credentials are needed at all.

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New Project → Import** the repo. Framework preset
   (Next.js) is auto-detected.
3. Under **Settings → Environment Variables**, add the variables from
   `.env.example`. Leave `USE_MOCK_DATA=true` until the items in
   "Remaining blockers" below are resolved — the dashboard will run fine
   on mock data in the meantime, which is useful for the team to react to
   the UI/structure before wiring in real data.
4. Deploy. Because `better-sqlite3` is a native module, Vercel's build
   step compiles it automatically on their Node runtime — no extra config
   needed for the default Node.js serverless functions.

## Switching from mock to live data

Set `USE_MOCK_DATA=false` and fill in the HubSpot/GA4/Shopify variables.
Then finish the `TODO`s in:
- `lib/providers/hubspot.ts` — funnel + attribution queries
- `lib/providers/ga4.ts` — website traffic stats (needs `npm install @google-analytics/data`)
- `lib/providers/shopify.ts` — supplementary Shopify metrics

The response shapes are already defined in `lib/types.ts` and mirrored by
the mock data in `lib/mockData.ts`, so once a provider function returns
data in that shape, no UI code needs to change.

`config/properties.ts` holds every exact HubSpot property name and value
the team confirmed (lead status values, deal stage mapping, season values,
meeting form names) — update values there, not inside the query logic, if
anything changes in HubSpot later.

## Access protection

This is an internal tool, but once deployed it sits at a public Vercel URL
unless you protect it. `middleware.ts` adds a simple HTTP Basic Auth gate —
set `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` in Vercel's env vars and
the whole app (pages + API routes) will prompt for credentials. Leave both
unset for local dev. If the team already has SSO (Google Workspace, etc.),
swap this for a proper auth provider instead — Basic Auth is a shared
password, not per-person access.

## Scheduled sync (Vercel Blob + Cron) - IMPORTANT SETUP STEP

Live mode (`USE_MOCK_DATA=false`) does **not** call HubSpot/GA4/Shopify on
every page load. Instead:

- Every Sunday evening (`vercel.json`: `"0 20 * * 0"`, ~21:00-22:00 Rome
  time depending on DST), Vercel Cron hits `/api/cron/sync`, which pulls
  fresh data from every source and saves it to **Vercel Blob** storage
  (`lib/liveSync.ts`, `lib/blobCache.ts`).
- Every normal page load reads that saved snapshot instead - fast, and
  doesn't hit any rate limits no matter how many people check the
  dashboard that week.
- A **"Refresh now" button** in the sidebar (`components/SyncStatus.tsx`)
  lets anyone trigger the same sync on demand, for whenever Sunday's
  snapshot isn't fresh enough - e.g. right before a Monday meeting, or
  after fixing a HubSpot config issue and wanting to see it reflected
  immediately rather than waiting for next Sunday.

**Required one-time setup in Vercel (can't be done from code):** go to
your Vercel project → **Storage** tab → **Create Database** → **Blob** →
follow the prompts to connect it to this project. Vercel auto-generates
and injects the `BLOB_READ_WRITE_TOKEN` env var itself - nothing to
copy-paste. Without this, live mode will fail with "No synced data yet"
on every page, since there's nowhere for the sync job to write to.

An earlier version of this used SQLite (`lib/db.ts`) for this same
purpose - that approach was scrapped because Vercel's serverless
functions don't share a persistent filesystem between invocations, so a
SQLite file written by one request wouldn't reliably still be there for
the next one. Vercel Blob is Vercel's own storage product, built for
exactly this kind of "write occasionally, read often" pattern.

Set `CRON_SECRET` in Vercel once things are working (Vercel signs its own
cron requests with the matching bearer token automatically) so the
scheduled endpoint can't be triggered by anyone who finds the URL. The
manual "Refresh now" button doesn't need this separately - it's already
behind the app's own Basic Auth login.

## Recent changes (brand colors, weekly cadence, funnel drip, deals/meetings)

- **Colors** now use the brand palette (`tailwind.config.ts`: `brand1` purple,
  `brand2` teal, `accent` grey, each with `pastel`/`dark` variants) instead
  of the placeholder teal/brick/slate scheme from the first draft.
- **Dates** display as `DD-MM-YYYY` everywhere (see `lib/dateFormat.ts`).
  The Goals page's deadline field is a validated text input in that format
  rather than a native date picker, since browsers render `<input
  type="date">` in the visitor's locale format, which isn't controllable.
- **Goal pacing** cards now show a week-over-week delta ("+123 vs last
  week") alongside the existing cumulative-vs-target view. Numbers are
  meant to refresh every Monday morning — see the Cron section below for
  how that's wired, and its one real caveat (Rome's DST).
- **Funnel drip** — a new section between the pacing cards and the
  pipeline charts, showing New Candidate → Confirmed as an actual
  conversion funnel: absolute counts, % of the top of funnel remaining at
  each stage, and the stage-to-stage conversion rate. (`lib/mockData.ts`:
  `computeFunnelDrip`, `components/FunnelDrip.tsx`.)
- **Pipeline stage charts** switched from a weekly small-multiples grid to
  a single month-on-month, year-on-year chart with a tab strip to switch
  between stages (`components/StageTabs.tsx`, `components/MonthlyYoYChart.tsx`,
  `lib/months.ts` for the week→month aggregation).
- **Deals** is now its own section: Closed Won vs Closed Lost, month on
  month, with an overall win rate (`components/DealsChart.tsx`).
- **Meetings** is now its own section: Booked vs Completed, month on
  month, with an overall completion rate (`components/MeetingsChart.tsx`).
  "Completed" still depends on the meeting-form association check in
  `lib/providers/hubspot.ts` once live data is wired in.

### Weekly Monday-morning refresh (Rome time) - how it's wired, and its limit

The team checks these numbers every Monday morning. Two things had to be
true for that to work correctly:

1. **The app's own "this week / last week" math must be Rome-timezone-aware.**
   `lib/weeks.ts` (`nowInRome()`, `currentAndPreviousWeekBounds()`) computes
   week boundaries (Monday-Sunday) using Europe/Rome local time, regardless
   of what timezone the server or a viewer's browser happens to be in. This
   part is fully correct, including across daylight saving changes.
2. **The scheduled sync job should fire close to 7am Monday, Rome time.**
   This part has a real limitation: Vercel Cron is UTC-only and doesn't
   support per-schedule timezones. `vercel.json` is set to `"0 6 * * 1"`
   (Monday 06:00 UTC), which lands at 07:00 Rome time during CET (winter)
   but drifts to 08:00 during CEST (summer, roughly late March-late
   October). This doesn't affect correctness — the data itself is still
   bucketed into the right week either way — only the exact minute the
   refresh happens. If landing on 7am precisely matters, either flip the
   cron expression twice a year around the clock changes, or move the
   trigger to an external scheduler with real per-timezone support (e.g.
   Crontap, or a GitHub Action with a `TZ` env var) pointed at the same
   `/api/cron/sync` route.

## Color system, round 2

- **Purple (`brand1`) is now the primary UI color**, teal (`brand2`) is
  secondary. Active nav items, active filter buttons, active stage tabs,
  and the current-year line in every year-on-year chart all use purple;
  teal is used for the next-most-recent year and other secondary accents.
  Colors are assigned by *recency rank* in the chart components
  (`colorForYearRank()` in `MonthlyYoYChart.tsx` / `YoYLineChart.tsx`), not
  hardcoded year numbers, so this keeps working if the tracked year range
  changes later.
- **Status colors are real green/red, not brand colors.** Added
  `success`/`danger` tokens to `tailwind.config.ts`, deliberately separate
  from the brand palette, so "on track" vs "behind pace" and the
  week-over-week delta on pacing cards always read as green/red regardless
  of any future brand color changes. Applied the same logic to the Deals
  win rate (green ≥50%, red <50%) and Meetings completion rate, since
  those are the other two "good/bad against a benchmark" numbers on the
  page — flagging that assumption in case only the pacing cards were meant
  to get this treatment.
- **Meetings** is no longer a single-year Booked-vs-Completed bar chart —
  it's now two year-on-year charts (Booked, Completed), reusing the same
  `MonthlyYoYChart` component the pipeline stages use, so meetings compare
  to the same period last year the same way the funnel stages do.

## Remaining blockers (carried over from the build brief)

1. **Credentials** — HubSpot private app token or Service Key (Contacts +
   Deals read scopes, plus `forms` for the meeting-completion form
   lookup — HubSpot doesn't have a separate "meetings" scope; meetings
   access comes via the Contacts scope) and GA4 service account JSON with
   Viewer access. Needed before `USE_MOCK_DATA=false` will work.
2. **UTM property names** — not yet confirmed with the team. Placeholders
   are in `config/properties.ts` (`UTM_PROPERTIES`) flagged with `TODO`.
   The fallback logic (UTM → `heard_about`) is already built — only the
   exact UTM property names need swapping in.
3. **Year field** — no dedicated "year" property was confirmed on
   HubSpot; the app currently derives year from the application/form
   submission date (`config/properties.ts`, `YEAR_SOURCE`). If a clean
   `year` property exists, swap the derivation for a direct property read.
4. **Deal pipeline ID** — the exact HubSpot pipeline ID containing "Invited
   to enroll" / "Paid deposit" / "Paid installment" / "Closed won" /
   "Closed lost" needs confirming before the live deal queries in
   `lib/providers/hubspot.ts` will resolve correctly.
5. **Meeting-form association check** — `fetchMeetings()` now calls the
   real HubSpot batch associations + Forms API to check which form (if
   any) is attached to each meeting, matching against the four form
   names the team confirmed. Untested against live data — flag it back if
   your portal doesn't expose "form" as a default meeting association
   type (the code comments explain the likely alternative: associating
   via the contact's form submission near the meeting time instead).
6. **Shopify scope** — which specific Shopify metrics matter beyond GA4
   (checkout funnel, product/variant views) is still to be confirmed with
   the team; `lib/providers/shopify.ts` covers the most likely candidates.
7. **Vercel Blob store** — the one setup step that can't be done from
   code: create + connect a Blob store in Vercel's dashboard (Storage tab).
   See "Scheduled sync" section above. Without this, live mode fails with
   "No synced data yet" on every page, since the weekly sync has nowhere
   to write its results.

## Project structure

```
app/            Next.js pages + API routes (one per tab, mirrored by /api/*)
components/     Sidebar, sync status/refresh button, filter bar, charts, pacing card
config/         properties.ts (HubSpot mapping), goals.json (editable targets)
lib/            types, mock data generator, week-alignment helper, data provider switch
lib/providers/  real HubSpot / GA4 / Shopify clients
lib/blobCache.ts    Vercel Blob read/write helpers
lib/liveSync.ts     the actual weekly sync job (pulls live data, writes to Blob)
app/api/cron/sync/    scheduled entry point (Vercel Cron, Sundays)
app/api/sync-now/     manual entry point ("Refresh now" button)
```
