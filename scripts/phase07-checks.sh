#!/bin/bash
PASS=0
FAIL=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

check() {
  if (cd "$ROOT" && eval "$2") > /dev/null 2>&1; then
    echo "  PASS: $1"
    ((PASS++))
  else
    echo "  FAIL: $1"
    ((FAIL++))
  fi
}

echo "=== Phase 7: End-of-Day Recap & Evaluation Framework ==="
echo ""

echo "--- Schema & Migration ---"
check "DailyRecap model in schema.prisma" "grep -q 'model DailyRecap' backend/prisma/schema.prisma"
check "BotSignalLog.postRejectPeakPct field" "grep -q 'postRejectPeakPct' backend/prisma/schema.prisma"
check "BotTrade.entryVwapDev field" "grep -q 'entryVwapDev' backend/prisma/schema.prisma"
check "BotTrade.peakPrice field" "grep -q 'peakPrice' backend/prisma/schema.prisma"
check "BotTrade.maxDrawdownPct field" "grep -q 'maxDrawdownPct' backend/prisma/schema.prisma"
check "DailyRecap sectionsJson Json field" "grep -q 'sectionsJson.*Json' backend/prisma/schema.prisma"
check "DailyRecap @@unique on date" "grep -A2 'model DailyRecap' backend/prisma/schema.prisma | grep -q '@@unique' || grep -q '@@unique.*date' backend/prisma/schema.prisma"
check "Migration SQL file exists" "test -f backend/prisma/migrations/20260301000001_phase7_recap/migration.sql"
check "Prisma validate passes" "cd backend && npx prisma validate"

echo ""
echo "--- Backend Services ---"
check "missedOpportunityTracker.ts exists" "test -f backend/src/services/missedOpportunityTracker.ts"
check "startMissedOpportunityWatch export" "grep -q 'export function startMissedOpportunityWatch' backend/src/services/missedOpportunityTracker.ts"
check "MAX_CONCURRENT_WATCHES cap" "grep -q 'MAX_CONCURRENT_WATCHES' backend/src/services/missedOpportunityTracker.ts"
check "Single batched getSnapshots call" "grep -q 'getSnapshots' backend/src/services/missedOpportunityTracker.ts"
check "eodRecap.ts exists" "test -f backend/src/services/eodRecap.ts"
check "computeRecap export" "grep -q 'computeRecap' backend/src/services/eodRecap.ts"
check "persistRecap export" "grep -q 'persistRecap' backend/src/services/eodRecap.ts"
check "scheduleRecapCron export" "grep -q 'scheduleRecapCron' backend/src/services/eodRecap.ts"
check "computeScore function" "grep -q 'computeScore' backend/src/services/eodRecap.ts"
check "generateSuggestions function" "grep -q 'generateSuggestions' backend/src/services/eodRecap.ts"
check "SPY/QQQ benchmark fetch" "grep -q 'SPY.*QQQ\|getSnapshots.*SPY' backend/src/services/eodRecap.ts"
check "Self-average computation" "grep -q 'selfAvg5d\|getSelfAverages\|selfAvg' backend/src/services/eodRecap.ts"

echo ""
echo "--- Signal Engine Wiring ---"
check "signalEngine imports missedOpportunityTracker" "grep -q 'missedOpportunityTracker' backend/src/services/signalEngine.ts"
check "signalEngine calls startMissedOpportunityWatch" "grep -q 'startMissedOpportunityWatch' backend/src/services/signalEngine.ts"

echo ""
echo "--- BotTrade Enrichment Wiring ---"
check "positionMonitor writes peakPrice to BotTrade" "grep -q 'peakPrice' backend/src/services/positionMonitor.ts"
check "positionMonitor tracks minPrice" "grep -q 'minPrice' backend/src/services/positionMonitor.ts"
check "tradeExecutor captures entryVwapDev" "grep -q 'entryVwapDev\|getVwapDev' backend/src/services/tradeExecutor.ts"

echo ""
echo "--- REST API ---"
check "GET /recap route in bot.ts" "grep -q \"'/recap'\" backend/src/routes/bot.ts"
check "GET /recap/history route in bot.ts" "grep -q \"'/recap/history'\" backend/src/routes/bot.ts"
check "scheduleRecapCron called in index.ts" "grep -q 'scheduleRecapCron' backend/src/index.ts"

echo ""
echo "--- Frontend Store ---"
check "recapStore.ts exists" "test -f frontend/src/store/recapStore.ts"
check "useRecapStore export" "grep -q 'useRecapStore' frontend/src/store/recapStore.ts"
check "RecapData interface" "grep -q 'RecapData' frontend/src/store/recapStore.ts"
check "pageStore includes recap" "grep -q 'recap' frontend/src/store/pageStore.ts"

echo ""
echo "--- Frontend WebSocket ---"
check "useSocket handles recap_ready" "grep -q 'recap_ready' frontend/src/hooks/useSocket.ts"

echo ""
echo "--- BotPanel Recap Tab ---"
check "BotPanel has recap tab type" "grep -q 'recap' frontend/src/components/panels/BotPanel.tsx"
check "BotPanel imports recapStore" "grep -q 'recapStore' frontend/src/components/panels/BotPanel.tsx"
check "BotPanel badge dot for recap" "grep -q 'recapUnread' frontend/src/components/panels/BotPanel.tsx"
check "BotPanel View full recap link" "grep -q 'View full recap\|setPage.*recap' frontend/src/components/panels/BotPanel.tsx"

echo ""
echo "--- RecapPage ---"
check "RecapPage.tsx exists" "test -f frontend/src/pages/RecapPage.tsx"
check "RecapPage imported in App.tsx" "grep -q 'RecapPage' frontend/src/App.tsx"
check "RecapPage uses Recharts" "grep -q 'recharts' frontend/src/pages/RecapPage.tsx"
check "RecapPage has day/week/month views" "grep -q 'ViewMode\|viewMode\|day.*week.*month' frontend/src/pages/RecapPage.tsx"
check "Recharts in package.json" "grep -q 'recharts' frontend/package.json"

echo ""
echo "--- TypeScript Compilation ---"
check "Backend tsc passes" "cd backend && npx tsc --noEmit"
check "Frontend tsc passes" "cd frontend && npx tsc --noEmit"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ $FAIL -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "SOME CHECKS FAILED — review above"
fi
