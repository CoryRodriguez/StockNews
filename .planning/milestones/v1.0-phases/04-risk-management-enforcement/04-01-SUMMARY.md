---
phase: 04-risk-management-enforcement
plan: 01
subsystem: database
tags: [prisma, postgresql, trailing-stop, bot-config, typescript]

# Dependency graph
requires:
  - phase: 03-trade-executor
    provides: BotConfig schema with tradeSizeStars3/4/5 and profitTargetPct; BotConfigRecord interface; positionMonitor.ts that will consume trailingStopPct/Dollar
provides:
  - trailingStopPct Float @default(0) and trailingStopDollar Float @default(0) in BotConfig model
  - BotConfigRecord interface updated with both trailing stop fields as number
  - Migration SQL 20260228000003 for VPS deployment
affects:
  - 04-03-positionMonitor (reads trailingStopPct/Dollar from getBotConfig() for EXIT-02 logic)
  - 05-frontend-bot-dashboard (exposes trailing stop config via PATCH /api/bot/config)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive schema migration: IF NOT EXISTS guard for idempotent VPS deployment"
    - "BotConfigRecord interface kept in sync with schema.prisma in the same commit to prevent drift"
    - "Default 0 = disabled pattern for optional features; pct takes precedence over dollar when both > 0"

key-files:
  created:
    - backend/prisma/migrations/20260228000003_add_trailing_stop_fields/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/services/botController.ts

key-decisions:
  - "Default 0 = disabled for both trailingStopPct and trailingStopDollar — trailing stop does not fire unless value > 0"
  - "pct takes precedence over dollar when both are set > 0 — simpler for positionMonitor.ts to implement with a single if/else"
  - "Fields added immediately after profitTargetPct in schema — keeps all exit-related thresholds grouped together"

patterns-established:
  - "Exit-related config fields grouped at bottom of BotConfig model (after profitTargetPct)"

requirements-completed: [EXIT-02]

# Metrics
duration: 1min
completed: 2026-02-28
---

# Phase 4 Plan 01: Trailing Stop Schema Fields Summary

**BotConfig schema extended with trailingStopPct and trailingStopDollar (both Float @default(0)) giving positionMonitor.ts configurable EXIT-02 trailing stop parameters**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-28T23:54:35Z
- **Completed:** 2026-02-28T23:55:55Z
- **Tasks:** 3 (2 with commits, 1 validation-only)
- **Files modified:** 3

## Accomplishments
- Added `trailingStopPct Float @default(0)` and `trailingStopDollar Float @default(0)` to BotConfig model in schema.prisma
- Updated BotConfigRecord TypeScript interface in botController.ts with both new fields as `number`
- Added both fields to initBot() upsert create block (value 0 = disabled by default)
- Created migration SQL `20260228000003_add_trailing_stop_fields/migration.sql` with two `ALTER TABLE` statements using `IF NOT EXISTS` guard for idempotent deployment
- Confirmed `prisma validate` passes and `tsc --noEmit` exits 0 with no TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add trailing stop fields to schema.prisma and BotConfigRecord** - `3a52fb6` (feat)
2. **Task 2: Create migration SQL for trailing stop fields** - `b6d157b` (chore)
3. **Task 3: TypeScript compile check** - validation only, no commit (no files changed)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added trailingStopPct and trailingStopDollar to BotConfig model (after profitTargetPct)
- `backend/src/services/botController.ts` - BotConfigRecord interface + initBot() create block updated with both fields
- `backend/prisma/migrations/20260228000003_add_trailing_stop_fields/migration.sql` - Two ALTER TABLE statements for VPS deployment

## Decisions Made
- Default 0 = disabled: trailing stop does not fire unless value is > 0, allowing the feature to be completely bypassed without changing code
- pct takes precedence over dollar when both are > 0: positionMonitor.ts can implement with a simple `if (trailingStopPct > 0)` check first
- Fields grouped after profitTargetPct in schema: keeps all exit-related thresholds (profit target, trailing stop) visually and logically adjacent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migration SQL will be applied on VPS deployment using the existing workflow (`ALTER TABLE IF NOT EXISTS` guard makes it safe to re-run).

## Next Phase Readiness
- Schema fields are ready — positionMonitor.ts (Plan 04-03) can now read `getBotConfig().trailingStopPct` and `getBotConfig().trailingStopDollar` for EXIT-02 trailing stop logic
- Migration SQL at `20260228000003` is ready for VPS deployment alongside the code push

---
*Phase: 04-risk-management-enforcement*
*Completed: 2026-02-28*

## Self-Check: PASSED

- FOUND: backend/prisma/schema.prisma
- FOUND: backend/src/services/botController.ts
- FOUND: backend/prisma/migrations/20260228000003_add_trailing_stop_fields/migration.sql
- FOUND: .planning/phases/04-risk-management-enforcement/04-01-SUMMARY.md
- FOUND: commit 3a52fb6 (feat - schema + interface)
- FOUND: commit b6d157b (chore - migration SQL)
