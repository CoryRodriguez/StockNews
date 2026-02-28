---
phase: 02-signal-engine
plan: "03"
subsystem: signal-engine
tags: [signal, ai, anthropic, claude, evaluateBotSignal, notifyReconnect, rtpr, alpacaNews, benzinga]

# Dependency graph
requires:
  - phase: 02-signal-engine
    plan: "02"
    provides: signalEngine.ts with evaluateBotSignal() and notifyReconnect() exports and all non-AI pipeline steps
  - phase: 02-signal-engine
    plan: "01"
    provides: BotSignalLog Prisma model + @anthropic-ai/sdk installed + config.anthropicApiKey + config.claudeSignalModel
provides:
  - Complete Claude AI evaluation for tier 3-4 articles via evaluateWithAI() in signalEngine.ts
  - All three news feeds (rtpr, alpacaNews, benzinga) route every article through evaluateBotSignal
  - RTPR and AlpacaNews WebSocket reconnects call notifyReconnect to start 30s suppression cooldown
  - All four AI outcomes handled: ai-unavailable (no key), ai-timeout (error/timeout), ai-declined (AI vetoed), fired/log-only (AI approved)
affects:
  - 03-* (Phase 3 trade executor — replaces log-only outcome with real order submission)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-init Anthropic singleton: getAnthropicClient() returns null if key absent — server starts cleanly without Claude key"
    - "appConfig alias to avoid shadowing local getBotConfig() result inside evaluateBotSignal function"
    - "evaluateWithAI returns null for both missing-key and error cases; caller disambiguates via getAnthropicClient() === null check"
    - "AI evaluation unconditional: evaluateBotSignal called outside any if-guard in all three news service files"
    - "hasConnectedOnce flag pattern: tracks first connect to enable notifyReconnect on subsequent ws.on('open') fires"

key-files:
  created: []
  modified:
    - backend/src/services/signalEngine.ts
    - backend/src/services/rtpr.ts
    - backend/src/services/alpacaNews.ts
    - backend/src/services/benzinga.ts

key-decisions:
  - "appConfig alias used for ../config import to avoid shadowing the local 'config = getBotConfig()' variable inside evaluateBotSignal"
  - "AI timeout (2s) enforced at Anthropic client level via constructor option — no separate Promise.race() needed"
  - "getAnthropicClient() called after aiResult===null to distinguish ai-unavailable (key absent) from ai-timeout (API error)"
  - "evaluateBotSignal placed unconditionally in each news service — outside the activeScanners guard, not inside it"
  - "benzinga.ts imports only evaluateBotSignal (not notifyReconnect) — REST poller has no WebSocket reconnect lifecycle"

patterns-established:
  - "Complete signal pipeline: tier 1-2 fires immediately with log-only; tier 3-4 goes to Claude then fires or is AI-declined"
  - "News service hook pattern: unconditional evaluateBotSignal(article).catch() after existing executePaperTrade block"

requirements-completed: [SIG-01, SIG-11]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 2 Plan 03: Claude AI Evaluation + News Service Hooks Summary

**Claude API evaluation for tier 3-4 articles wired into signalEngine.ts (2s timeout, 4 outcome paths), and evaluateBotSignal hooked into all three news feeds (rtpr, alpacaNews, benzinga) with WebSocket reconnect notifications in the two ws-based services**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-28T17:11:34Z
- **Completed:** 2026-02-28T17:14:13Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `evaluateWithAI()` to signalEngine.ts — calls `@anthropic-ai/sdk` with 2-second timeout, parses JSON response, handles all error cases
- All four AI outcome paths write correct BotSignalLog records: `ai-unavailable` (no API key), `ai-timeout` (error/timeout), `ai-declined` (AI vetoed), `fired/log-only` (AI approved)
- All three news services (rtpr, alpacaNews, benzinga) call `evaluateBotSignal(article).catch()` unconditionally for every article
- RTPR and AlpacaNews add `hasConnectedOnce` flag and call `notifyReconnect` on WebSocket reconnect; Benzinga correctly skips this (REST poller)
- TypeScript compiles clean: zero errors across all four modified files

## Task Commits

1. **Task 1: Add Claude AI evaluation to signalEngine.ts** - `f502426` (feat)
2. **Task 2: Hook evaluateBotSignal into rtpr.ts, alpacaNews.ts, and benzinga.ts** - `32e68e7` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/services/signalEngine.ts` — Added Anthropic import + `appConfig` alias, lazy-init `getAnthropicClient()`, `evaluateWithAI()` helper, and replaced tier 3-4 placeholder with full AI evaluation branch
- `backend/src/services/rtpr.ts` — Added import, `hasConnectedOnce` flag, `notifyReconnect('rtpr')` on reconnect, `evaluateBotSignal` call after executePaperTrade
- `backend/src/services/alpacaNews.ts` — Added import, `hasConnectedOnce` flag, `notifyReconnect('alpaca')` on reconnect, `evaluateBotSignal` call inside ticker loop
- `backend/src/services/benzinga.ts` — Added import (evaluateBotSignal only), `evaluateBotSignal` call inside ticker loop

## Decisions Made

- Used `appConfig` alias for `../config` import to avoid shadowing the local `const config = getBotConfig()` inside `evaluateBotSignal` — TypeScript would silently use the wrong variable without the alias
- 2-second timeout enforced at Anthropic client constructor level (`timeout: 2000`) — the SDK throws on timeout so the `catch` in `evaluateWithAI` cleanly returns null
- After `aiResult === null`, check `getAnthropicClient() === null` to distinguish the two null causes: key-absent returns null from the client getter; error/timeout returns null from the try/catch. This avoids needing a separate flag variable
- `evaluateBotSignal` placed unconditionally outside the `if (activeScanners.length > 0)` guard — the signal engine is always active regardless of paper trade state

## Deviations from Plan

None - plan executed exactly as written. One naming conflict (config alias) was identified proactively from reading the file before editing — this was a natural consequence of the plan's interface section which showed the local variable name.

## Issues Encountered

None — TypeScript compiled clean on first attempt after the `appConfig` alias was applied.

## User Setup Required

None - no new external service configuration required. `ANTHROPIC_API_KEY` was noted as needed in the previous plan (02-01) and is already in the STATE.md todos.

## Next Phase Readiness

Phase 2 Signal Engine is now complete:
- All 11 SIG requirements delivered across 3 plans (SIG-02 through SIG-10 in 02-02; SIG-01 and SIG-11 in this plan)
- The signal pipeline is fully functional in log-only mode: every article from every news source flows through the full evaluation gauntlet, and tier 3-4 articles receive Claude AI evaluation
- Ready for Phase 3: Trade Executor + Position Monitor — the `fired` outcome in signalEngine.ts is the hook point where Phase 3 will replace `log-only` with real order submission

---

## Self-Check: PASSED

- FOUND: backend/src/services/signalEngine.ts (contains evaluateWithAI, ai-timeout, ai-unavailable, ai-declined)
- FOUND: backend/src/services/rtpr.ts (contains evaluateBotSignal, notifyReconnect)
- FOUND: backend/src/services/alpacaNews.ts (contains evaluateBotSignal, notifyReconnect)
- FOUND: backend/src/services/benzinga.ts (contains evaluateBotSignal, no notifyReconnect)
- FOUND: commit f502426 (Task 1 — signalEngine.ts AI evaluation)
- FOUND: commit 32e68e7 (Task 2 — news service hooks)
- tsc --noEmit: zero errors

---
*Phase: 02-signal-engine*
*Completed: 2026-02-28*
