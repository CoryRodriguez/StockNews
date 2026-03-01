#!/usr/bin/env bash
# Phase 6: Live Trading Mode — Automated Verification Suite
# Run: bash .planning/phases/06-live-trading-mode/phase06-checks.sh

set -e
PASS=0
FAIL=0
ROOT="C:/Projects/StockNews"

check() {
  local desc="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  PASS  $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Phase 6: Live Trading Mode — Verification ==="
echo ""

# ── TypeScript compilation ──────────────────────────────────────────────────────
echo "── TypeScript ──"
check "Backend tsc --noEmit passes" \
  "cd '$ROOT/backend' && npx tsc --noEmit"
check "Frontend tsc --noEmit passes" \
  "cd '$ROOT/frontend' && npx tsc --noEmit"

# ── LIVE-01: Mode switching infrastructure ─────────────────────────────────────
echo ""
echo "── LIVE-01: Mode switching infrastructure ──"
check "getAlpacaBaseUrl() exists in botController.ts" \
  "grep -q 'getAlpacaBaseUrl' '$ROOT/backend/src/services/botController.ts'"
check "botController returns alpacaLiveUrl when mode=live" \
  "grep -q 'alpacaLiveUrl' '$ROOT/backend/src/services/botController.ts'"
check "switchMode exported from botController.ts" \
  "grep -q 'export.*switchMode\|switchMode.*export' '$ROOT/backend/src/services/botController.ts'"
check "switchMode imported in bot.ts" \
  "grep -q 'switchMode' '$ROOT/backend/src/routes/bot.ts'"
check "POST /mode route exists in bot.ts" \
  "grep -q \"router.post('/mode'\" '$ROOT/backend/src/routes/bot.ts'"

# ── LIVE-02: UI confirmation + open-position guard ────────────────────────────
echo ""
echo "── LIVE-02: UI confirmation + position guard ──"
check "evaluateGoLiveGate imported in bot.ts" \
  "grep -q 'evaluateGoLiveGate' '$ROOT/backend/src/routes/bot.ts'"
check "Gate check only runs for live direction (mode === 'live' guard)" \
  "grep -q \"mode === 'live'\" '$ROOT/backend/src/routes/bot.ts'"
check "switchMode called in /mode route" \
  "grep -q 'switchMode(mode' '$ROOT/backend/src/routes/bot.ts'"
check "showLiveConfirm state in BotPanel.tsx" \
  "grep -q 'showLiveConfirm' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "handleModeSwitch function in BotPanel.tsx" \
  "grep -q 'handleModeSwitch' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "CONFIRM LIVE button in BotPanel.tsx" \
  "grep -q 'CONFIRM LIVE' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "CANCEL button in BotPanel.tsx" \
  "grep -q 'CANCEL' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "Post to /api/bot/mode in BotPanel.tsx" \
  "grep -q '/api/bot/mode' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"

# ── LIVE-03: Go-live gate ─────────────────────────────────────────────────────
echo ""
echo "── LIVE-03: Go-live gate ──"
check "goLiveGate.ts service file exists" \
  "test -f '$ROOT/backend/src/services/goLiveGate.ts'"
check "GoLiveGate interface exported from goLiveGate.ts" \
  "grep -q 'export interface GoLiveGate' '$ROOT/backend/src/services/goLiveGate.ts'"
check "evaluateGoLiveGate function exported" \
  "grep -q 'export async function evaluateGoLiveGate' '$ROOT/backend/src/services/goLiveGate.ts'"
check "Gate checks trade count (GATE_MIN_TRADES)" \
  "grep -q 'GATE_MIN_TRADES' '$ROOT/backend/src/services/goLiveGate.ts'"
check "Gate checks win rate (GATE_MIN_WIN_RATE)" \
  "grep -q 'GATE_MIN_WIN_RATE' '$ROOT/backend/src/services/goLiveGate.ts'"
check "Gate checks clean days (GATE_MIN_CLEAN_DAYS)" \
  "grep -q 'GATE_MIN_CLEAN_DAYS' '$ROOT/backend/src/services/goLiveGate.ts'"
check "countConsecutiveBusinessDays helper exists" \
  "grep -q 'countConsecutiveBusinessDays' '$ROOT/backend/src/services/goLiveGate.ts'"
check "GET /gate route exists in bot.ts" \
  "grep -q \"router.get('/gate'\" '$ROOT/backend/src/routes/bot.ts'"
check "Gate display in BotPanel (tradeCountMet)" \
  "grep -q 'tradeCountMet' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "Gate display in BotPanel (winRateMet)" \
  "grep -q 'winRateMet' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "Gate display in BotPanel (cleanDaysMet)" \
  "grep -q 'cleanDaysMet' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "Gate fetch in BotPanel (GET /api/bot/gate)" \
  "grep -q '/api/bot/gate' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"
check "LIVE button disabled when gate not passed" \
  "grep -q 'liveGate?.passed\|liveGate.passed' '$ROOT/frontend/src/components/panels/BotPanel.tsx'"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL — $FAIL check(s) failed. Fix before marking Phase 6 complete."
  exit 1
else
  echo "PASS — All checks passed."
fi
