#!/usr/bin/env bash
PASS=0; FAIL=0
ROOT="C:/Projects/StockNews"

check_grep() {
  local desc="$1"; local pattern="$2"; local file="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

check_file() {
  local desc="$1"; local file="$2"
  if [ -f "$file" ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

check_tsc() {
  local desc="$1"; local dir="$2"
  local errors
  errors=$(cd "$dir" && npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l)
  if [ "$errors" -eq 0 ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc (${errors} errors)"; FAIL=$((FAIL+1))
  fi
}

echo "=== Phase 5 Verification ==="

# TypeScript
check_tsc "Backend tsc passes"  "$ROOT/backend"
check_tsc "Frontend tsc passes" "$ROOT/frontend"

# Backend routes
check_grep "GET /config route exists"    "router.get('/config'"    "$ROOT/backend/src/routes/bot.ts"
check_grep "PATCH /config route exists"  "router.patch('/config'"  "$ROOT/backend/src/routes/bot.ts"
check_grep "GET /positions route exists" "router.get('/positions'" "$ROOT/backend/src/routes/bot.ts"
check_grep "GET /trades route exists"    "router.get('/trades'"    "$ROOT/backend/src/routes/bot.ts"
check_grep "GET /signals route exists"   "router.get('/signals'"   "$ROOT/backend/src/routes/bot.ts"
check_grep "dayTradeCount in /status"    "dayTradeCount"           "$ROOT/backend/src/routes/bot.ts"

# WebSocket broadcasts
check_grep "broadcast in botController"  "broadcast" "$ROOT/backend/src/services/botController.ts"
check_grep "broadcast in positionMonitor" "broadcast" "$ROOT/backend/src/services/positionMonitor.ts"
check_grep "broadcast in signalEngine"   "broadcast" "$ROOT/backend/src/services/signalEngine.ts"

# Frontend types
check_grep "'bot' in PanelType"          '"bot"'              "$ROOT/frontend/src/types/index.ts"
check_grep "bot WsMessage types"         "bot_status_update"  "$ROOT/frontend/src/types/index.ts"

# botStore
check_file "botStore.ts exists"          "$ROOT/frontend/src/store/botStore.ts"
check_grep "useBotStore exported"        "export const useBotStore" "$ROOT/frontend/src/store/botStore.ts"

# useSocket wiring
check_grep "'bot' channel subscribed"    '"bot"'                      "$ROOT/frontend/src/hooks/useSocket.ts"
check_grep "subscribedRef.clear() fix"   "subscribedRef.current.clear" "$ROOT/frontend/src/hooks/useSocket.ts"
check_grep "bot_status_update handler"   "bot_status_update"           "$ROOT/frontend/src/hooks/useSocket.ts"

# Dashboard
check_grep "BotPanel in Dashboard"       "BotPanel"  "$ROOT/frontend/src/pages/Dashboard.tsx"
check_grep "bot-1 in DEFAULT_PANELS"     "bot-1"     "$ROOT/frontend/src/store/dashboardStore.ts"

# BotPanel component
check_file "BotPanel.tsx exists"         "$ROOT/frontend/src/components/panels/BotPanel.tsx"
check_grep "Status tab in BotPanel"      '"status"'          "$ROOT/frontend/src/components/panels/BotPanel.tsx"
check_grep "Config tab Save button"      "Save Config"       "$ROOT/frontend/src/components/panels/BotPanel.tsx"
check_grep "PDT counter"                 "pdtResetDay\|dayTradeCount" "$ROOT/frontend/src/components/panels/BotPanel.tsx"
check_grep "Emergency STOP button"       "text-red-400\|border-red-600" "$ROOT/frontend/src/components/panels/BotPanel.tsx"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "ALL CHECKS PASS" || echo "SOME CHECKS FAILED — fix before marking complete"
