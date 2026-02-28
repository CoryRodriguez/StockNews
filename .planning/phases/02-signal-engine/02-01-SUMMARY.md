---
phase: 02-signal-engine
plan: "01"
subsystem: database
tags: [prisma, postgresql, anthropic, claude, config]

# Dependency graph
requires:
  - phase: 01-bot-infrastructure-foundation
    provides: BotTrade, BotConfig, BotDailyStats models and bot controller foundation
provides:
  - BotSignalLog Prisma model with 17 fields and 3 indexes for signal audit trail
  - Migration SQL at 20260228000001_add_bot_signal_log
  - @anthropic-ai/sdk installed as dependency
  - config.anthropicApiKey and config.claudeSignalModel constants
affects:
  - 02-02-signal-engine
  - 02-03-signal-engine
  - All plans that call prisma.botSignalLog.create()

# Tech tracking
tech-stack:
  added:
    - "@anthropic-ai/sdk ^0.78.0 — Anthropic Claude API client"
  patterns:
    - "BotSignalLog: one record per evaluated news article for permanent audit trail (SIG-07)"
    - "config constants follow process.env ?? fallback pattern established in Phase 1"
    - "Model string constant (claudeSignalModel) in config.ts for single-place model version update"

key-files:
  created:
    - backend/prisma/migrations/20260228000001_add_bot_signal_log/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/package.json
    - backend/src/config.ts

key-decisions:
  - "claudeSignalModel hardcoded in config.ts not env — model version is a code decision not deployment config"
  - "anthropicApiKey falls back to empty string — allows server to start without Claude key; signal engine handles unavailable gracefully"
  - "BotSignalLog placed after BotDailyStats in schema maintaining logical grouping of bot tables"

patterns-established:
  - "Signal log write: prisma.botSignalLog.create() callable from signalEngine.ts after prisma generate"
  - "Claude model constant: config.claudeSignalModel used in all Claude API calls for easy model upgrades"

requirements-completed: [SIG-07, SIG-11]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 2 Plan 01: Signal Engine Foundation — Schema + SDK Summary

**BotSignalLog audit table (17 fields, 3 indexes) + @anthropic-ai/sdk installed + config.anthropicApiKey and config.claudeSignalModel constants wired**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T17:02:34Z
- **Completed:** 2026-02-28T17:04:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added BotSignalLog Prisma model with all 17 fields (outcome, rejectReason, failedPillar, AI fields, market snapshot fields) and 3 DB indexes (symbol, outcome, evaluatedAt)
- Created migration SQL at `20260228000001_add_bot_signal_log/migration.sql` with CREATE TABLE + 3 CREATE INDEX statements
- Regenerated Prisma client so `prisma.botSignalLog.create()` is callable with full type safety
- Installed `@anthropic-ai/sdk ^0.78.0` — prerequisite for Claude signal classification in Plan 02-03
- Added `anthropicApiKey` and `claudeSignalModel` constants to config.ts following existing env fallback pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: BotSignalLog model + migration SQL** - `0c61852` (feat)
2. **Task 2: @anthropic-ai/sdk install + config constants** - `cd65f51` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added BotSignalLog model block after BotDailyStats
- `backend/prisma/migrations/20260228000001_add_bot_signal_log/migration.sql` - CREATE TABLE + indexes
- `backend/package.json` - @anthropic-ai/sdk added to dependencies
- `backend/src/config.ts` - anthropicApiKey (from env) and claudeSignalModel constant added

## Decisions Made
- `claudeSignalModel: "claude-haiku-4-5-20251022"` is a string constant in config, not an env var — the model version is a development/code decision, not a deployment configuration
- `anthropicApiKey` falls back to `""` (empty string) so the server starts cleanly even without a Claude API key; the signal engine (Plan 02-03) will detect the empty key and set outcome to "ai-unavailable"
- Placed the Anthropic config fields between `alpacaLiveUrl` and `paperTradeQty` to keep alpaca config grouped and anthropic in its own logical section

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. Prisma validate passed immediately; tsc --noEmit was clean; npm install completed without errors.

## User Setup Required

**ANTHROPIC_API_KEY must be added manually by the user:**

1. Add to `backend/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Add to `docker-compose.yml` under the backend service environment:
   ```yaml
   - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
   ```

3. Add `ANTHROPIC_API_KEY=sk-ant-...` to VPS `/opt/stocknews/.env`

Note: The signal engine gracefully handles a missing key (outcome = "ai-unavailable") so this is not a blocker for development.

## Next Phase Readiness
- Plan 02-02 can now import `prisma.botSignalLog` (Prisma client regenerated)
- Plan 02-03 can now `import Anthropic from "@anthropic-ai/sdk"` and use `config.claudeSignalModel`
- Migration will be applied to production DB on next `prisma migrate deploy` run during VPS deployment

## Self-Check: PASSED

- FOUND: backend/prisma/schema.prisma (BotSignalLog model present)
- FOUND: backend/prisma/migrations/20260228000001_add_bot_signal_log/migration.sql
- FOUND: backend/src/config.ts (anthropicApiKey + claudeSignalModel)
- FOUND: .planning/phases/02-signal-engine/02-01-SUMMARY.md
- FOUND: commit 0c61852 (Task 1 — schema + migration)
- FOUND: commit cd65f51 (Task 2 — SDK + config)
- prisma validate: exits 0
- tsc --noEmit: zero errors

---
*Phase: 02-signal-engine*
*Completed: 2026-02-28*
