---
phase: 07-end-of-day-recap-evaluation-framework
verified: 2026-03-01T23:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Navigate to BotPanel and verify the 5th 'Recap' tab appears and renders the summary card with hero P&L, score badge, stats grid, and date picker"
    expected: "Recap tab is present; clicking it shows hero P&L (green/red large number), score badge (0-100 color-coded), win/loss grid, signals row, best/worst trade row, benchmarks, suggestions list, and 'View full recap' link"
    why_human: "Visual UI rendering, layout quality, and Tailwind class rendering cannot be verified programmatically"
  - test: "Click 'View full recap' link — verify it navigates to the RecapPage full-page view with Day/Week/Month toggle and Recharts charts"
    expected: "RecapPage renders with three view-mode buttons (Day, Week, Month), a date picker, a back button, and Recharts charts (LineChart for intraday P&L in Day mode, BarChart with green/red bars in Week and Month modes)"
    why_human: "Recharts chart rendering, ResponsiveContainer sizing, and chart data visualization require visual confirmation"
  - test: "Verify the badge dot appears on the Recap tab after 4:01 PM ET on a weekday when a recap is computed"
    expected: "A small blue dot appears on the 'recap' tab label after the 4:01 PM ET cron fires; the dot disappears when the user clicks the Recap tab"
    why_human: "Time-triggered behavior requires real-time observation at the correct clock time"
  - test: "Verify the 4 expandable deep-dive sections in the Day view expand/collapse correctly and show enriched trade data"
    expected: "Clicking a section header toggles expansion; Trade Breakdown shows VWAP Dev, Peak Price, Max DD% columns; Signal Rejection shows a histogram bar chart; Catalyst Performance shows per-category rows; Strategy Adherence shows on-target/early-exit/overhold labels"
    why_human: "Expandable section interaction, table layout, and chart rendering require visual confirmation with real data"
---

# Phase 7: EOD Recap and Evaluation Framework Verification Report

**Phase Goal:** Build an end-of-day recap and evaluation framework that automatically computes daily trading performance, identifies missed opportunities, scores the trading session, and presents results in a dedicated Recap tab and full-page view with historical browsing.
**Verified:** 2026-03-01T23:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | After a signal is rejected, the bot watches the stock's price for 30 minutes and flags it as a missed opportunity if the stock moved +5%+ | VERIFIED | `missedOpportunityTracker.ts` — single 60s poll loop, 30-min watch window, `MISSED_OPP_THRESHOLD = 5.0`, writes `postRejectPeakPct` to DB. `signalEngine.ts` calls `startMissedOpportunityWatch` at 15 distinct rejection paths. |
| 2 | BotTrade records include enrichment data (VWAP deviation at entry, peak price, max drawdown) for the trade-by-trade breakdown | VERIFIED | `positionMonitor.ts` tracks `minPrice` and `peakPrice` in `TrackedPosition`, writes both to `BotTrade` in `closePosition()`. `tradeExecutor.ts` captures `entryVwapDev` via fire-and-forget `getVwapDev()` after trade creation. Schema fields confirmed in `schema.prisma`. |
| 3 | A daily recap is computed from BotTrade, BotSignalLog, BotDailyStats, and StrategyRule data and includes a 0-100 composite score, 1-3 actionable suggestions, SPY/QQQ benchmarks, and 5d/30d self-average comparisons | VERIFIED | `eodRecap.ts` — `computeRecap()` uses `Promise.all` across 7 parallel queries (trades, signals, dailyStats, strategyRules, SPY/QQQ snapshots, selfAvg5d, selfAvg30d). `computeScore()` implements weighted composite (P&L 30%, win rate 25%, signal quality 20%, risk 15%, adherence 10%). `generateSuggestions()` returns max 3 rule-based suggestions. |
| 4 | At 4:01 PM ET each weekday, the recap is persisted to the DailyRecap table and a badge notification appears on the Recap tab | VERIFIED | `scheduleRecapCron()` registers `cron.schedule('1 16 * * 1-5', ...)` with `{ timezone: 'America/New_York' }`. Calls `persistRecap()` then broadcasts `{ type: 'recap_ready' }` on the 'bot' WS channel. `useSocket.ts` sets `recapUnread=true` on `recap_ready`. `BotPanel.tsx` shows blue dot when `recapUnread` is true. |
| 5 | BotPanel has a 5th Recap tab showing a summary card with hero P&L, score, stats, date picker, and "View full recap" link | VERIFIED | `BotPanel.tsx` — `BotTab` type includes `"recap"`, tab array is `["status", "history", "signals", "config", "recap"]`. Recap tab renders: hero P&L (color-coded), score badge (0-100), win/loss/trade/signal grid, best/worst trade, benchmarks row, suggestions list, date picker, "View full recap" button. |
| 6 | The /recap full page has Day, Week, and Month views with Recharts bar and line charts, expandable deep-dive sections (trade breakdown, signal rejections, catalyst performance, strategy adherence), and period-over-period comparisons | VERIFIED | `RecapPage.tsx` (1036 lines) — `ViewMode = "day" \| "week" \| "month"` toggle. Day view: `LineChart` for P&L timeline with `ReferenceDot` markers, 4 expandable sections via `Set<string>` toggle pattern. Week view: `BarChart` with `Cell` for green/red bars. Month view: grouped weekly `BarChart`. `TrendIndicator` component for period-over-period deltas at all levels (5d avg, 30d avg, vs prev week, vs prev month). Recharts `^3.7.0` in `package.json`. App.tsx routes `page === "recap"` to `<RecapPage />`. |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `backend/prisma/schema.prisma` | DailyRecap model, BotSignalLog.postRejectPeakPct, BotTrade enrichment fields | VERIFIED | `model DailyRecap` at line 263, `postRejectPeakPct Float?` at line 254, `entryVwapDev/peakPrice/maxDrawdownPct Float?` at lines 85-91 and 176-178. `@@unique([date])` + `@@index([date])`. `sectionsJson Json`. |
| `backend/prisma/migrations/20260301000001_phase7_recap/migration.sql` | SQL migration for schema changes | VERIFIED | 36-line file exists. Contains `ALTER TABLE "BotSignalLog"`, `ALTER TABLE "BotTrade"` (3 columns), `CREATE TABLE "DailyRecap"`, `CREATE UNIQUE INDEX`, `CREATE INDEX`. |
| `backend/src/services/missedOpportunityTracker.ts` | Background 30-min price watcher, exports startMissedOpportunityWatch | VERIFIED | Exports `startMissedOpportunityWatch`. Single `setInterval(POLL_INTERVAL_MS)` — one shared loop. `MAX_CONCURRENT_WATCHES = 50` cap. Batches all watched symbols into single `getSnapshots()` call per tick. Leaf service (no upstream service imports). |
| `backend/src/services/eodRecap.ts` | Recap computation service — computeRecap, persistRecap, scheduleRecapCron | VERIFIED | All 5 expected exports present: `computeRecap`, `persistRecap`, `scheduleRecapCron`, `DailyRecapData`, `RecapSections`. 605 lines, fully substantive. |
| `backend/src/routes/bot.ts` | GET /api/bot/recap and GET /api/bot/recap/history endpoints | VERIFIED | `/recap/history` registered BEFORE `/recap` (correct ordering). Both routes use `requireAuth`. History route has `getWeekDates`/`getMonthDates` helpers. |
| `frontend/src/store/recapStore.ts` | useRecapStore — recap data, loading state, selected date, recapUnread | VERIFIED | Exports `useRecapStore`. Has `RecapData`, `RecapSummary` interfaces. State includes `recap`, `loading`, `error`, `selectedDate`, `recapUnread`, and all setters. |
| `frontend/src/store/pageStore.ts` | Page type extended with 'recap' | VERIFIED | `export type Page = "dashboard" \| "trades" \| "newsfeeds" \| "recap"` |
| `frontend/src/hooks/useSocket.ts` | recap_ready WS handler | VERIFIED | Imports `useRecapStore`. Handler at line 90: `else if (msg.type === "recap_ready")` → calls `useRecapStore.getState().setRecapUnread(true)`. |
| `frontend/src/components/panels/BotPanel.tsx` | 5th Recap tab with summary card, badge dot, date picker | VERIFIED | `BotTab` type includes `"recap"`. Tab array has 5 entries. Badge dot with `recapUnread` check. Date picker bound to `selectedDate`. `setPage("recap")` navigation. |
| `frontend/src/pages/RecapPage.tsx` | Full-page recap with Recharts charts, deep-dive, Day/Week/Month views | VERIFIED | 1036 lines. Imports Recharts `BarChart`, `Bar`, `LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`, `Cell`, `ReferenceDot`. Three view modes. 4 expandable sections. `TrendIndicator` component. Period-over-period comparisons. |
| `frontend/src/App.tsx` | page === 'recap' → RecapPage | VERIFIED | `import RecapPage from './pages/RecapPage'` at line 8. `if (page === "recap") return <RecapPage />;` at line 39. |
| `scripts/phase07-checks.sh` | Automated verification script | VERIFIED | 45 checks, all PASS when run. Backend and frontend `tsc --noEmit` both pass. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `signalEngine.ts` | `missedOpportunityTracker.ts` | `import startMissedOpportunityWatch`, called after writeSignalLog | WIRED | 15 call sites: steps 3, 4, 6a, 6b, 7, 8, 9, 10a, 10b, 10c, 10.5, 10.6, 11a, 11b + import at line 31 |
| `positionMonitor.ts` | `prisma.botTrade.update` | write peakPrice and maxDrawdownPct at close time | WIRED | `TrackedPosition.minPrice` tracked in poll loop (line 47). `closePosition()` writes `peakPrice: pos.peakPrice` and `maxDrawdownPct` (lines 143-145). |
| `tradeExecutor.ts` | `alpaca.getVwapDev` | fire-and-forget VWAP capture after trade creation | WIRED | Import at line 20. Called at line 347, updates `entryVwapDev` on BotTrade (line 351). |
| `bot.ts` (routes) | `eodRecap.ts` | import computeRecap, called from GET /recap | WIRED | `import { computeRecap }` at line 15. Called in `/recap` route handler. |
| `eodRecap.ts` | `clientHub.ts` | import broadcast, called from 4:01 PM cron | WIRED | `broadcast('bot', { type: 'recap_ready', date: dateET })` at line 596. |
| `eodRecap.ts` | `prisma.dailyRecap` | upsert for persistence | WIRED | `prisma.dailyRecap.upsert({ where: { date: dateET }, ... })` at line 537. |
| `index.ts` | `eodRecap.scheduleRecapCron` | called at server startup | WIRED | `import { scheduleRecapCron }` at line 27. `scheduleRecapCron()` called at line 123. |
| `App.tsx` | `RecapPage.tsx` | conditional render based on page state | WIRED | `if (page === "recap") return <RecapPage />` at line 39. |
| `BotPanel.tsx` | `recapStore.ts` | import useRecapStore for recap data and unread state | WIRED | `import { useRecapStore, RecapData }` at line 5. Destructured at lines 183-186. |
| `BotPanel.tsx` | `pageStore.ts` | import usePageStore for 'View full recap' navigation | WIRED | `setPage("recap")` called at line 617 on "View full recap" button click. |
| `useSocket.ts` | `recapStore.ts` | on recap_ready message, set recapUnread to true | WIRED | `useRecapStore.getState().setRecapUnread(true)` at line 91. |
| `RecapPage.tsx` | `recharts` | import chart components | WIRED | `from "recharts"` at line 14. 11 chart components imported and used throughout. |

---

### Requirements Coverage

The 21 requirement IDs declared for Phase 7 (RECAP-SCHEMA through RECAP-VERIFY) are defined exclusively in ROADMAP.md and plan frontmatter — they do NOT appear in REQUIREMENTS.md, which covers only the 47 v1 bot requirements (INFRA, SIG, EXEC, EXIT, RISK, UI, LIVE). The RECAP-* requirements are a Phase 7-specific extension set.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| RECAP-SCHEMA | 07-01 | DailyRecap model + BotSignalLog.postRejectPeakPct + BotTrade enrichment fields | SATISFIED | All 3 schema extensions present in schema.prisma; migration SQL file exists |
| RECAP-MISSED-OPP | 07-01 | missedOpportunityTracker 30-min price watch for rejected signals | SATISFIED | missedOpportunityTracker.ts implemented with single batched loop, MAX_CONCURRENT_WATCHES cap |
| RECAP-ENRICHMENT | 07-01 | BotTrade.entryVwapDev / peakPrice / maxDrawdownPct written at trade open/close | SATISFIED | positionMonitor writes peakPrice+maxDrawdownPct, tradeExecutor captures entryVwapDev |
| RECAP-COMPUTATION | 07-02 | computeRecap aggregates 5 data sources in parallel | SATISFIED | eodRecap.ts uses Promise.all across 7 parallel queries |
| RECAP-SCORING | 07-02 | 0-100 composite score (P&L 30%, win rate 25%, signal quality 20%, risk 15%, adherence 10%) | SATISFIED | computeScore() implements exactly this formula with clamp |
| RECAP-SUGGESTIONS | 07-02 | 1-3 rule-based actionable suggestions | SATISFIED | generateSuggestions() implements 5 rules, returns max 3 |
| RECAP-BENCHMARKS | 07-02 | SPY/QQQ daily % change as benchmark comparison | SATISFIED | getSnapshots(['SPY', 'QQQ']) in computeRecap, changePct used for spyChangePct/qqqChangePct |
| RECAP-ADHERENCE | 07-02 | Strategy adherence analysis comparing actual vs recommended hold time | SATISFIED | StrategyRule lookup, adherenceLabel computed per trade (on-target/early-exit/overhold) |
| RECAP-CATALYST | 07-02 | Per-catalyst-category P&L and win rate breakdown | SATISFIED | catalystMap groups trades by catalystType, CatalystPerformanceRow array built |
| RECAP-PERSIST | 07-02 | 4:01 PM ET cron persists recap to DailyRecap table | SATISFIED | scheduleRecapCron() with cron expression '1 16 * * 1-5', timezone 'America/New_York' |
| RECAP-API | 07-02 | GET /api/bot/recap and GET /api/bot/recap/history REST endpoints | SATISFIED | Both routes in bot.ts, /recap/history before /recap for correct Express matching |
| RECAP-BADGE | 07-02 | recap_ready WS broadcast at 4:01 PM ET | SATISFIED | broadcast('bot', { type: 'recap_ready' }) called from cron |
| RECAP-TAB | 07-03 | BotPanel 5th Recap tab with summary card | SATISFIED | 5th tab in BotPanel with hero P&L, score badge, stats grid, suggestions |
| RECAP-NAV | 07-03 | "View full recap" link navigates to /recap page | SATISFIED | setPage("recap") button at BotPanel line 617 |
| RECAP-BADGE-DOT | 07-03 | Badge dot on Recap tab when recapUnread is true | SATISFIED | Absolute-positioned blue dot when `recapUnread && t === "recap"` |
| RECAP-WS | 07-03 | recap_ready WS message sets recapUnread state | SATISFIED | useSocket.ts handler at line 90-91 |
| RECAP-FULL-PAGE | 07-04 | RecapPage component accessible at page="recap" | SATISFIED | App.tsx routes page==="recap" to RecapPage |
| RECAP-CHARTS | 07-04 | Recharts bar and line charts in RecapPage | SATISFIED | LineChart for intraday, BarChart+Cell for week/month views; recharts ^3.7.0 in package.json |
| RECAP-HISTORICAL | 07-04 | Day, Week, Month views with historical browsing | SATISFIED | ViewMode toggle, GET /api/bot/recap/history consumption, date picker |
| RECAP-DEEP-DIVE | 07-04 | 4 expandable deep-dive sections with enriched data | SATISFIED | Set<string> toggle pattern, 4 sections (trades, signals, catalysts, adherence) |
| RECAP-VERIFY | 07-05 | Automated verification suite + human visual approval | SATISFIED (automated) | 45/45 checks pass; human visual approval PENDING |

**Note on REQUIREMENTS.md:** RECAP-* requirement IDs do not appear in `.planning/REQUIREMENTS.md`. That file covers only the original 47 v1 bot requirements (last updated 2026-02-27). The RECAP-* IDs are defined solely within the ROADMAP.md Phase 7 section and plan frontmatter. This is not a gap — REQUIREMENTS.md was intentionally scoped to the autonomous bot milestone v1. Phase 7 requirements are self-contained in the planning documents.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | Zero TODO/FIXME/placeholder comments found across all 5 key Phase 7 files. No stub return patterns found in service or component implementations. |

All `return null` instances found are legitimate conditional returns (e.g., `getSelfAverages` returns null when no prior data; `TrendIndicator` returns null when no previous value; `SuggestionsCard` returns null when no suggestions). None represent placeholder implementations.

---

### Human Verification Required

The automated suite (45/45 checks pass) and all three verification levels (exists, substantive, wired) confirm the backend and frontend are correctly implemented. The following items require human visual confirmation:

### 1. BotPanel Recap Tab Visual Appearance

**Test:** Open the app, navigate to the Bot Panel, click the 5th "Recap" tab.
**Expected:** Tab appears with label "recap" alongside status/history/signals/config tabs. Clicking it shows a summary card with: a large green/red P&L number as the hero metric, a color-coded score badge (0-100), a 2x2 stats grid (Win/Loss, Trades, Signals, Best/Worst), SPY/QQQ benchmark line, a suggestions block, a date input, and a "View full recap" link. On a day with no trades, "No recap data for YYYY-MM-DD" message should appear.
**Why human:** Visual layout, color rendering, Tailwind class application, and responsiveness of the tab content cannot be verified programmatically.

### 2. RecapPage Full-Page View with Recharts Charts

**Test:** In the Recap tab, click "View full recap" — verify it navigates to the full-page RecapPage. Toggle between Day, Week, and Month view modes.
**Expected:** Full-page view renders with: header showing "Daily Recap" title, date picker, Day/Week/Month toggle buttons, and "← Dashboard" back button. Day mode shows an intraday P&L LineChart area and 4 collapsible sections. Week mode shows a Mon-Fri BarChart with green/red bars. Month mode shows weekly rollup BarChart. Charts render without React errors and fill available width correctly (ResponsiveContainer sizing).
**Why human:** Recharts rendering, ResponsiveContainer parent height, chart data visualization, and chart-to-container sizing require live browser rendering.

### 3. Badge Dot Lifecycle

**Test:** Wait until after 4:01 PM ET on a trading weekday; observe the Recap tab.
**Expected:** A small blue dot appears on the "recap" tab label. Clicking the tab clears the dot.
**Why human:** Time-triggered badge requires real-time clock at 4:01 PM ET — not reproducible programmatically during verification.

### 4. Expandable Deep-Dive Sections with Enriched Data

**Test:** In Day view with trade data available, click each deep-dive section header to expand/collapse.
**Expected:** Chevron toggles expansion. Trade Breakdown table shows VWAP Dev, Peak Price, Max DD% columns with numeric values. Signal Rejection section shows vertical histogram BarChart of rejection reasons. Catalyst Performance shows per-category rows with win rate. Strategy Adherence shows green "on-target", yellow "early-exit", red "overhold" labels.
**Why human:** Data-dependent visual output with enriched trade fields requires real trading data and visual inspection.

---

### Gaps Summary

No gaps found. All 6 observable truths are verified, all 12 key links are wired, all 21 RECAP-* requirements are satisfied by the implementation, and the automated verification suite confirms 45/45 checks pass with zero TypeScript compilation errors.

The only outstanding item is human visual confirmation of the Recap tab and RecapPage UI (RECAP-VERIFY human component). The automated portion of RECAP-VERIFY is satisfied.

---

_Verified: 2026-03-01T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
