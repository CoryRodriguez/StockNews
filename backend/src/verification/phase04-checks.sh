#!/usr/bin/env bash
# Phase 4: Risk Management Enforcement — Automated Verification
# Run from: c:/Projects/StockNews/backend
set -euo pipefail

PASS=0
FAIL=0

check() {
  local desc="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Phase 4: Risk Management Enforcement Verification ==="
echo ""

echo "--- TypeScript ---"
check "tsc --noEmit passes (no type errors)" "npx tsc --noEmit"

echo ""
echo "--- Schema ---"
check "prisma validate passes" "npx prisma validate"
check "BotConfig has trailingStopPct field" "grep -q 'trailingStopPct' prisma/schema.prisma"
check "BotConfig has trailingStopDollar field" "grep -q 'trailingStopDollar' prisma/schema.prisma"
check "Migration 20260228000003 exists" "test -f prisma/migrations/20260228000003_add_trailing_stop_fields/migration.sql"

echo ""
echo "--- BotConfigRecord Interface (botController.ts) ---"
check "BotConfigRecord has trailingStopPct field" "grep -q 'trailingStopPct: number' src/services/botController.ts"
check "BotConfigRecord has trailingStopDollar field" "grep -q 'trailingStopDollar: number' src/services/botController.ts"

echo ""
echo "--- RISK-02: Max Concurrent Positions (signalEngine.ts) ---"
check "signalEngine imports getOpenPositionCount" "grep -q 'getOpenPositionCount' src/services/signalEngine.ts"
check "signalEngine rejects with max-positions reason" "grep -q \"'max-positions'\" src/services/signalEngine.ts"

echo ""
echo "--- RISK-05: Per-Symbol Concentration (signalEngine.ts) ---"
check "signalEngine imports getOpenSymbols" "grep -q 'getOpenSymbols' src/services/signalEngine.ts"
check "signalEngine rejects with already-holding reason" "grep -q \"'already-holding'\" src/services/signalEngine.ts"

echo ""
echo "--- RISK-03: PDT Enforcement (tradeExecutor.ts) ---"
check "tradeExecutor has checkPdtLimit function" "grep -q 'checkPdtLimit' src/services/tradeExecutor.ts"
check "tradeExecutor has pdt_limit rejection" "grep -q \"'pdt_limit'\" src/services/tradeExecutor.ts"
check "checkPdtLimit returns false for paper mode" "grep -B10 'async function checkPdtLimit' src/services/tradeExecutor.ts | grep -qi 'paper'"
check "PDT check fails open on API error (returns false)" "grep -A10 'checkPdtLimit' src/services/tradeExecutor.ts | grep -q 'return false'"

echo ""
echo "--- RISK-04: Daily Reset Cron (positionMonitor.ts) ---"
check "positionMonitor has 4AM cron schedule" "grep -q '0 4 \* \* 1-5' src/services/positionMonitor.ts"
check "positionMonitor has scheduleDailyReset function" "grep -q 'scheduleDailyReset' src/services/positionMonitor.ts"
check "positionMonitor has cronsScheduled guard" "grep -q 'cronsScheduled' src/services/positionMonitor.ts"

echo ""
echo "--- EXIT-02: Trailing Stop (positionMonitor.ts) ---"
check "positionMonitor has trailing_stop exit reason" "grep -q 'trailing_stop' src/services/positionMonitor.ts"
check "positionMonitor uses trailingStopPct from config" "grep -q 'trailingStopPct' src/services/positionMonitor.ts"
check "positionMonitor uses trailingStopDollar from config" "grep -q 'trailingStopDollar' src/services/positionMonitor.ts"
check "hard_stop appears before trailing_stop (EXIT-01 order)" "awk '/hard_stop/{hard=NR} /trailing_stop/{trail=NR} END{exit !(hard < trail)}' src/services/positionMonitor.ts"

echo ""
echo "--- Exports (positionMonitor.ts) ---"
check "positionMonitor exports getOpenPositionCount" "grep -q 'export function getOpenPositionCount' src/services/positionMonitor.ts"
check "positionMonitor exports getOpenSymbols" "grep -q 'export function getOpenSymbols' src/services/positionMonitor.ts"

echo ""
echo "=================================================="
echo "Results: $PASS passed, $FAIL failed"
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "ALL CHECKS PASSED — Phase 4 automated verification complete"
  exit 0
else
  echo "FAILURES DETECTED — fix before marking phase complete"
  exit 1
fi
