---
phase: 01-bot-infrastructure-foundation
plan: "01"
subsystem: database
tags: [prisma, schema, migration, bot, database]
dependency_graph:
  requires: []
  provides: [BotTrade-model, BotConfig-model, BotDailyStats-model, prisma-client-types]
  affects: [01-02-botController, 01-03-REST-routes, Phase2-SignalEngine, Phase3-TradeExecutor, Phase4-RiskManagement]
tech_stack:
  added: []
  patterns: [singleton-row-pattern, comma-separated-string-for-array-defaults, date-keyed-daily-stats]
key_files:
  created:
    - backend/prisma/migrations/20260228000000_add_bot_tables/migration.sql
  modified:
    - backend/prisma/schema.prisma
key_decisions:
  - "enabledCatalystTiers stored as comma-separated String ('1,2,3,4') not Int[] — avoids Prisma array default edge cases; callers parse with .split(',').map(Number)"
  - "BotConfig uses @id @default('singleton') — enforces single-row constraint at DB level"
  - "BotTrade status/exitReason are plain String fields not enums — avoids migration churn if values need expanding"
  - "updatedAt columns in SQL migration have no DEFAULT — Prisma client manages all updatedAt writes"
  - "prisma generate TypeScript types succeeded; Windows DLL binary rename blocked by file lock but existing binary functional"
metrics:
  duration_minutes: 2
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 1
  completed_date: "2026-02-28"
---

# Phase 1 Plan 01: DB Schema Migration Summary

Three Prisma models added (BotTrade, BotConfig, BotDailyStats) plus migration SQL — full bot persistence layer ready for Phases 2-6 with no schema migrations needed later.

## What Was Built

### Models Added to backend/prisma/schema.prisma

**BotTrade** — full lifecycle record for every trade the bot considers or executes
- Fields: id, symbol, entryPrice, exitPrice, shares, pnl, catalystType, catalystTier, exitReason, status, alpacaOrderId, entryAt, exitAt, createdAt, updatedAt
- Indexes: status (query by open/closed/missed), symbol (per-ticker lookup), createdAt (time-range queries)
- status values: `"open"` | `"closed"` | `"missed"`
- exitReason values: `"trailing_stop"` | `"hard_stop"` | `"profit_target"` | `"time_exit"` | `"force_close"` | `"reconciled_missing_on_startup"`

**BotConfig** — singleton configuration row (id fixed to `"singleton"`)
- All threshold fields defined upfront with sensible defaults
- positionSizeUsd: 500, hardStopLossPct: 7.0, maxHoldDurationSec: 300
- maxConcurrentPositions: 3, dailyLossLimitUsd: 500, minWinRate: 0.5
- maxFloatShares: 20,000,000, maxSharePrice: 20, minRelativeVolume: 5
- enabledCatalystTiers: `"1,2,3,4"` (String, not Int[])
- mode: `"paper"` | `"live"`, state: `"stopped"` | `"running"` | `"paused"`

**BotDailyStats** — one row per trading day, keyed on date string
- date: `"YYYY-MM-DD"` in ET timezone
- realizedPnl, tradeCount, dayTradeCount (default 0)
- `@@unique([date])` enforces one row per day for upsert safety

### Migration SQL Created

File: `backend/prisma/migrations/20260228000000_add_bot_tables/migration.sql`

Plain CREATE TABLE statements matching the Prisma schema exactly. Key details:
- BotTrade: 3 indexes (status, symbol, createdAt)
- BotConfig: TEXT PRIMARY KEY DEFAULT 'singleton' for singleton design
- BotDailyStats: UNIQUE INDEX on date column
- updatedAt: no SQL DEFAULT (Prisma client manages all writes)

### Prisma Client Generated

`prisma.botTrade`, `prisma.botConfig`, `prisma.botDailyStats` now available to TypeScript. `prisma validate` confirms schema is syntactically correct.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| enabledCatalystTiers as String "1,2,3,4" | Prisma Int[] defaults have edge cases; String is simple and explicit |
| BotConfig singleton via @id @default("singleton") | Enforces single-row constraint at schema level; no application logic needed |
| status/exitReason as String not enum | Avoids migration churn if values need expanding; documented in schema comments |
| All thresholds defined in Plan 01 | Later phases (2-6) can begin inserting records without schema changes |
| BotDailyStats @@unique([date]) | Enables safe upsert operations from circuit breakers and PDT guard |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

- `prisma generate` hit a Windows EPERM file lock on `query_engine-windows.dll.node` (the existing backend process holds it). The TypeScript type generation succeeded (1143+ references in index.d.ts). The DLL binary was already present and functional — this does not affect TypeScript compilation or the VPS deployment.

## Self-Check

- [x] `backend/prisma/schema.prisma` contains 3 new model blocks
- [x] `backend/prisma/migrations/20260228000000_add_bot_tables/migration.sql` exists
- [x] `prisma validate` exits 0
- [x] Existing models (User, Watchlist, Layout, PaperTrade, TradeAnalytics, PriceSnapshot, NewsArticle, StrategyRule) unchanged
- [x] All 3 task commits exist: 7fe590a, c6859b2, 4cb0f4a
