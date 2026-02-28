---
phase: 01-bot-infrastructure-foundation
plan: 02
subsystem: infra
tags: [alpaca, prisma, botcontroller, singleton, typescript, state-machine]

# Dependency graph
requires:
  - phase: 01-01
    provides: BotConfig, BotTrade, BotDailyStats Prisma models + migration SQL
provides:
  - botController.ts singleton service with 9 exported functions
  - getAlpacaBaseUrl() mode-aware URL selector (paper vs live)
  - initBot() startup reconciliation with non-fatal Alpaca error handling
  - switchMode() open-position guard at service layer
  - getBotState() / getBotConfig() synchronous accessors for Phase 2+ signal code
  - alpacaLiveUrl added to config.ts (enables Phase 6 mode switch)
affects:
  - Phase 2 Signal Engine (calls getBotState, getBotConfig, getAlpacaBaseUrl)
  - Phase 3 Trade Executor (calls setBotState, getAlpacaBaseUrl)
  - Phase 5 Frontend Dashboard (calls switchMode, updateConfig)
  - Phase 6 Live Trading Mode (uses config.alpacaLiveUrl via getAlpacaBaseUrl)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level singleton with let botState / let botConfig — never exported directly"
    - "Synchronous accessors (getBotState/getBotConfig) for zero-async-overhead reads in hot paths"
    - "Non-fatal async init: reconcilePositions catches all errors, logs warning, never rethrows"
    - "Prisma upsert with empty update{} for idempotent singleton creation"

key-files:
  created:
    - backend/src/services/botController.ts
  modified:
    - backend/src/config.ts

key-decisions:
  - "getAlpacaBaseUrl() falls back to paper URL when botConfig is null — safe before initBot() completes"
  - "reconcilePositions() is non-fatal: catches all errors so server starts even if Alpaca is unreachable at boot"
  - "switchMode() guard is at service layer (not just route layer) to prevent mode changes with open positions"
  - "en-CA locale used for getTodayDateET() — natively produces YYYY-MM-DD without string manipulation"
  - "res.json() cast to typed array fixes TS2322 from unknown return type of fetch Response.json()"

patterns-established:
  - "BotConfigRecord interface: enabledCatalystTiers is comma-separated string — parse with .split(',').map(Number)"
  - "getBotConfig() returns non-null only after initBot() is awaited — callers must not call before server startup completes"
  - "All Alpaca calls use getAlpacaBaseUrl() — never hardcode paper or live URL directly"

requirements-completed: [INFRA-04, INFRA-05, INFRA-07, INFRA-08]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 1 Plan 02: botController.ts Singleton Summary

**Bot singleton controller with mode-aware Alpaca URL selection, startup position reconciliation, and service-layer open-position guard for mode switching**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T03:20:12Z
- **Completed:** 2026-02-28T03:21:45Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `botController.ts` singleton following the strategyEngine.ts module-level pattern with 9 exported functions covering the full state machine interface
- Added `alpacaLiveUrl` to `config.ts` enabling Phase 6 paper-to-live switch as a single config change with no code modifications
- `initBot()` uses `prisma.botConfig.upsert` for idempotent singleton creation, restores persisted state, and runs non-fatal startup reconciliation
- `reconcilePositions()` marks DB-open positions not found in broker response as `status=missed` — crash recovery without blocking server start
- `switchMode()` enforces open-position guard at service layer via `prisma.botTrade.count({ where: { status: 'open' } })` before accepting mode change

## Exported Function Signatures

Phase 2 (Signal Engine) and Phase 3 (Trade Executor) will use these:

```typescript
// Initialization — called once in index.ts server.listen callback
export async function initBot(): Promise<void>

// Synchronous accessors — safe to call from hot signal evaluation paths
export function getBotState(): BotState                 // 'stopped' | 'running' | 'paused'
export function getBotConfig(): BotConfigRecord         // non-null after initBot() resolves

// URL selector — all Alpaca HTTP calls must use this
export function getAlpacaBaseUrl(): string              // mode-aware: paper or live URL

// State transitions — called by Phase 3 trade executor and bot routes
export async function setBotState(newState: BotState): Promise<void>
export async function persistState(): Promise<void>

// Mode switching — enforces open-position guard (INFRA-08)
export async function switchMode(newMode: BotMode): Promise<void>

// Config updates — for Phase 5 UI configuration panel
export async function updateConfig(
  patch: Partial<Omit<BotConfigRecord, 'id' | 'updatedAt'>>
): Promise<BotConfigRecord>

// Market hours — for signal gating
export function isMarketOpen(): boolean
```

## BotConfigRecord Interface

Phase 2 signal code reads these fields from `getBotConfig()`:

```typescript
export interface BotConfigRecord {
  id: string;
  enabled: boolean;
  state: string;
  mode: string;                        // 'paper' | 'live'
  positionSizeUsd: number;
  confidenceMultiplierHigh: number;    // default 2.0
  confidenceMultiplierMed: number;     // default 1.0
  confidenceMultiplierLow: number;     // default 0.5
  maxConcurrentPositions: number;      // default 3
  dailyLossLimitUsd: number;
  minWinRate: number;
  hardStopLossPct: number;
  maxHoldDurationSec: number;
  enabledCatalystTiers: string;        // comma-separated: "1,2,3,4" — parse with .split(',').map(Number)
  maxFloatShares: number;
  maxSharePrice: number;
  minRelativeVolume: number;
  updatedAt: Date;
}
```

**Key design notes:**
- `enabledCatalystTiers` is a comma-separated string — callers must parse: `.split(',').map(Number)`
- `getBotConfig()` returns non-null only after `initBot()` has been awaited at server startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add alpacaLiveUrl to config.ts** - `04cae2f` (feat)
2. **Task 2: Create botController.ts singleton service** - `270c70f` (feat)

## Files Created/Modified

- `backend/src/services/botController.ts` — Bot singleton: state machine, config loading, reconciliation, mode switching (233 lines)
- `backend/src/config.ts` — Added `alpacaLiveUrl: "https://api.alpaca.markets"` after `alpacaPaperUrl`

## Decisions Made

- `getAlpacaBaseUrl()` falls back to paper URL when `botConfig` is null — safe before `initBot()` completes at server startup
- `reconcilePositions()` catches all errors and warns (never throws) — server must start even if Alpaca is unreachable outside market hours or with invalid keys
- `switchMode()` guard is implemented at service layer rather than only route layer per INFRA-08 requirement
- `en-CA` locale used in `getTodayDateET()` — natively formats as YYYY-MM-DD without string manipulation
- Explicit cast `(await res.json() as Array<{ symbol: string }>)` fixes TypeScript TS2322 from unknown fetch response type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript TS2322 type error on fetch response**
- **Found during:** Task 2 (botController.ts — reconcilePositions function)
- **Issue:** `res.json()` returns `unknown` in TypeScript; assigning directly to `Array<{ symbol: string }>` fails with TS2322
- **Fix:** Added explicit type cast `(await res.json() as Array<{ symbol: string }>)` to satisfy TypeScript strict checking
- **Files modified:** `backend/src/services/botController.ts`
- **Verification:** `npx tsc --noEmit` returns zero errors after fix
- **Committed in:** `270c70f` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type correctness)
**Impact on plan:** Type cast is necessary for TypeScript correctness; no behavior change. No scope creep.

## Issues Encountered

None beyond the TypeScript type error documented above, which was auto-fixed inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `botController.ts` is ready for Phase 2 (Signal Engine) to import `getBotState`, `getBotConfig`, `getAlpacaBaseUrl`, `isMarketOpen`
- `initBot()` must be called in `backend/src/index.ts` server startup — this is Plan 01-03's responsibility
- Phase 3 (Trade Executor) will call `setBotState()` and `persistState()` during order lifecycle
- Phase 5 (Frontend Dashboard) will call `switchMode()` and `updateConfig()` via REST routes
- Phase 6 (Live Trading) uses `config.alpacaLiveUrl` via `getAlpacaBaseUrl()` — no code changes needed at that point

---
*Phase: 01-bot-infrastructure-foundation*
*Completed: 2026-02-28*
