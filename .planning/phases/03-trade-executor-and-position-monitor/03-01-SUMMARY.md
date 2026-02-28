---
phase: 03-trade-executor-and-position-monitor
plan: "01"
subsystem: database
tags: [prisma, postgresql, schema, migration, bot-config, trade-executor]

# Dependency graph
requires:
  - phase: 01-bot-infrastructure-foundation
    provides: BotConfig model with base fields (hardStopLossPct, positionSizeUsd, etc.)
provides:
  - BotConfig model with tradeSizeStars3, tradeSizeStars4, tradeSizeStars5, profitTargetPct fields
  - Migration SQL 20260228000002_add_bot_config_sizing_fields for VPS deployment
  - BotConfigRecord TypeScript interface updated with four new number fields
affects: [03-trade-executor, 03-04-init-bot-create-block, phase-3-executor-code]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IF NOT EXISTS in ALTER TABLE for idempotent manual migration SQL"
    - "Schema + interface updated together to keep Prisma model and TypeScript in sync before prisma generate"

key-files:
  created:
    - backend/prisma/migrations/20260228000002_add_bot_config_sizing_fields/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/services/botController.ts

key-decisions:
  - "tradeSizeStars3=$50, tradeSizeStars4=$75, tradeSizeStars5=$100 flat-dollar defaults match CONTEXT.md"
  - "profitTargetPct=10 default matches CONTEXT.md profit target exit threshold"
  - "BotConfigRecord interface updated in same commit as schema to prevent TypeScript drift"
  - "Migration applied via db execute (not migrate deploy) consistent with Phase 1/2 pattern"

patterns-established:
  - "Star-rating flat-dollar sizing: fixed USD amounts per star tier, not multiplier of positionSizeUsd"

requirements-completed: [EXEC-05, EXEC-07]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 3 Plan 01: BotConfig Star-Rating Sizing Fields Summary

**Added four missing BotConfig fields (tradeSizeStars3/4/5 + profitTargetPct) to Prisma schema, TypeScript interface, and manual migration SQL — unblocking all Phase 3 executor code**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T19:31:50Z
- **Completed:** 2026-02-28T19:34:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added four Float fields to BotConfig model in schema.prisma with correct defaults (50/75/100/10)
- Updated BotConfigRecord TypeScript interface in botController.ts with four matching number fields
- Created idempotent migration SQL with IF NOT EXISTS ALTER TABLE statements
- Ran prisma generate to regenerate client with new fields
- tsc --noEmit and prisma validate both pass clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sizing fields to BotConfig schema and update BotConfigRecord** - `8812123` (feat)
2. **Task 2: Create migration SQL file for new BotConfig columns** - `80af4df` (chore)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added tradeSizeStars3, tradeSizeStars4, tradeSizeStars5, profitTargetPct fields to BotConfig model
- `backend/src/services/botController.ts` - Added four matching number fields to BotConfigRecord interface
- `backend/prisma/migrations/20260228000002_add_bot_config_sizing_fields/migration.sql` - Four IF NOT EXISTS ALTER TABLE statements for VPS deployment

## Decisions Made
- BotConfigRecord interface updated in the same commit as schema.prisma to keep TypeScript and Prisma models in sync (prevents drift before prisma generate runs)
- Migration uses IF NOT EXISTS on all ALTER TABLE statements for idempotency, matching Phase 1/2 established pattern
- Database apply step skipped locally (Docker not available in sandbox); migration SQL ready for VPS deployment via `npx prisma db execute`

## Deviations from Plan

None - plan executed exactly as written.

Note: TypeScript errors appeared briefly after Task 1 schema edit (before prisma generate in Task 2) — this was the expected sequencing. Both tasks completed before final verification, and tsc --noEmit passes cleanly after prisma generate regenerated the client.

## Issues Encountered
- Local database unavailable (Docker not running in sandbox) — migration SQL created and ready for VPS deployment. This is consistent with the project's established deployment workflow (migrate on VPS, not locally).

## User Setup Required
None — schema changes deploy automatically with the next VPS git pull + docker compose build cycle.

## Next Phase Readiness
- BotConfig schema has all fields needed for Phase 3 executor code
- TypeScript types updated and compiling clean
- Migration SQL ready to apply on VPS with: `npx prisma db execute --file ./prisma/migrations/20260228000002_add_bot_config_sizing_fields/migration.sql --schema ./prisma/schema.prisma`
- Phase 3 Plan 02 (tradeExecutor service) can now reference tradeSizeStars3/4/5 and profitTargetPct without TypeScript errors

## Self-Check: PASSED

- FOUND: backend/prisma/schema.prisma
- FOUND: backend/src/services/botController.ts
- FOUND: backend/prisma/migrations/20260228000002_add_bot_config_sizing_fields/migration.sql
- FOUND: .planning/phases/03-trade-executor-and-position-monitor/03-01-SUMMARY.md
- FOUND commit 8812123: feat(03-01): add tradeSizeStars3/4/5 and profitTargetPct to BotConfig schema
- FOUND commit 80af4df: chore(03-01): create migration SQL for BotConfig star-rating sizing fields

---
*Phase: 03-trade-executor-and-position-monitor*
*Completed: 2026-02-28*
