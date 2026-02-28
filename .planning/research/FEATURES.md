# Feature Landscape: Autonomous Trading Bot

**Domain:** Catalyst-driven momentum day trading bot
**Platform context:** Subsequent milestone — extending existing Day Trade Dashboard
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH (Alpaca API verified via official docs; exit strategy / signal criteria from domain knowledge + codebase analysis; academic references noted where applicable)

---

## Preface: What Already Exists

The existing platform is further along than a typical "start from scratch" bot. The following are **already built** and the bot milestone must build on them, not re-implement them:

| Existing Component | Bot Impact |
|---|---|
| `catalystClassifier.ts` — categorizes news into 16 types + tier 1-4 | Signal engine is a filter layer on top, not a replacement |
| `strategyEngine.ts` — learns holdDurationSec + trailingStopPct from historical trades | Exit strategy engine already exists; bot wires it in |
| `paperTrader.ts` — executes paper buy+sell via Alpaca paper API | Autonomous executor already exists in embryonic form; needs signal gating |
| `scanner.ts` — tracks gap up/down, momentum, high rVol tickers | Signal confirmation (scanner alert = ticker is active) already implemented |
| `priceTracker.ts` — price snapshots at intervals for each trade | Already feeding strategy engine; no change needed |
| `tradeAnalytics.ts` — records entry/exit context | Already capturing VWAP dev, rVol, catalyst tier |

The bot milestone is primarily about:
1. **Signal engine** — deciding WHEN to fire (not yet built)
2. **Risk manager** — global circuit breakers and position limits (not yet built)
3. **Live trading integration** — swapping paper API for live API (architectural)
4. **Bot control UI** — monitoring panel (not yet built)

---

## Table Stakes

Features required before the bot can safely run in any mode (paper or live). Missing any of these means the bot is either non-functional or dangerous.

### 1. Catalyst Signal Gate

**What:** A filter that evaluates whether an incoming catalyst event is worth trading. Goes beyond "is this a tier 1 catalyst?" to score the event against historical win rate data.

**Why expected:** Without this, the existing `paperTrader.ts` fires on ALL catalyst events. The bot needs a configurable threshold so it only trades high-probability setups.

**Signal criteria for catalyst-driven momentum plays:**

| Criterion | Why It Matters | Threshold (starting point) |
|---|---|---|
| Catalyst tier | Higher tiers have faster, larger moves | Tier 1 (M&A) or Tier 2 (FDA) required |
| Catalyst category win rate (from strategyEngine) | Historical data from our own trades | Win rate >= 50%, or use strategyEngine confidence >= 0.3 |
| Scanner confirmation | Ticker must already be active on a scanner | At least one scanner alert active |
| Price range filter | Penny stocks (<$1) are untradeable; large caps ($200+) move less on catalysts | $1 to $100 is the sweet spot for catalyst plays |
| Volume confirmation | Catalyst must have driven real volume, not a quiet move | relativeVolume >= 1.5x at time of news |
| Time-of-day gate | Pre-market catalyst plays behave differently; early open (9:30-10:30) is highest velocity | configurable; start with market hours only for live |
| Cooldown guard | Already implemented — prevent double-buying same ticker | Already in `paperTrader.ts`, 5min default |
| Danger pattern filter | Already implemented — "offering", "going concern" etc. block entry | Already in `catalystClassifier.ts` |

**Complexity:** Medium — the individual checks are simple; the complexity is the configurable threshold system and persisting the signal config.

---

### 2. Hard Stop Loss (Not Just Trailing Stop)

**What:** A fixed stop loss that triggers if price drops X% from entry — regardless of whether a peak has been established. This is distinct from the trailing stop which only activates after price has moved in our favor.

**Why critical:** The existing `paperTrader.ts` trailing stop only triggers when `price < peakPrice * (1 - trailingStopPct/100)` AND `peakPrice > entryPrice`. If price immediately drops from entry (a gap fill or news reversal), the trailing stop never fires until peak > entry. Without a hard stop, a losing trade can hold for the full `holdDeadlineSec` with no protection.

**Implementation:** Track `entryPrice`. If `currentPrice < entryPrice * (1 - hardStopPct/100)`, sell immediately. This should run in the same polling loop as the trailing stop.

**Starting values (to be validated with historical data):**
- Tier 1 (M&A): hard stop 5% (acquirer sets floor; stock trades to deal price)
- Tier 2 (FDA): hard stop 10% (biotech can reverse violently)
- Tier 3 (Earnings): hard stop 7%
- Tier 4 (Contracts, etc.): hard stop 8%

**Complexity:** Low — one additional condition in the existing poll loop.

---

### 3. Daily Max Loss Circuit Breaker

**What:** If cumulative P&L for the day falls below a threshold (e.g., -$500 paper, or -2% of account equity live), halt all new trades for the rest of the session.

**Why critical:** This is the #1 risk management requirement for any automated system. Without it, a sequence of bad trades (common on volatile catalyst days) can wipe out far more than acceptable. Pro traders call this the "max daily drawdown" rule.

**Implementation:**
- Track daily P&L from `PaperTrade` records (or live account P&L from Alpaca)
- Check before every new trade entry
- Expose via REST endpoint so UI can show status
- Reset at midnight ET or at session start

**Complexity:** Low — sum of today's `pnl` values; check on each signal event.

---

### 4. Max Concurrent Positions Limit

**What:** Cap the number of open positions at N (configurable; suggest 3 for paper, 2 for live v1).

**Why critical:** Without this, a news burst (multiple catalysts at once, common on sector-wide FDA or macro days) can result in 10+ simultaneous positions with correlated risk.

**Implementation:** Count `activePositions.size` in `paperTrader.ts` before entering. Already partially present — the `activePositions` Map tracks open positions.

**Complexity:** Trivial — one size check.

---

### 5. Position Sizing Algorithm

**What:** Determine trade size algorithmically rather than a fixed `paperTradeQty` config value.

**Why critical:** A fixed 10-share quantity means wildly different dollar exposure on a $2 stock vs a $50 stock. For live trading, this becomes a real risk problem.

**Recommended approach — fixed dollar risk per trade:**

```
positionSize = tradeCapital / entryPrice
where tradeCapital = min(maxDollarPerTrade, accountEquity * riskPct)
```

**Starting parameters:**
- Paper mode: fixed $500 per trade (overrides share quantity)
- Live mode v1: 1% of account equity per trade (e.g., $250 on a $25,000 account)
- Hard cap: never exceed 5% of account equity in a single position

**Why NOT Kelly Criterion for v1:** Kelly requires reliable win rate and payoff ratio data. We don't have enough historical trades at launch. Use fixed fractional sizing until strategy engine has 50+ trades per category.

**Alpaca note:** Alpaca supports fractional shares on market orders, so you can specify `notional` (dollar amount) instead of `qty`. This is cleaner for dollar-based sizing. Verified: Alpaca supports `notional` parameter on order creation.

**Complexity:** Low — calculate notional before order placement.

---

### 6. Bot Enable/Disable Control

**What:** A persistent on/off switch that stops the bot from firing any new trades. Should survive server restarts.

**Why critical:** The user needs a reliable kill switch. A config flag in an env var isn't sufficient because it requires a server restart. The bot must be pauseable at runtime.

**Implementation:** `botEnabled` boolean in the database (or a simple JSON config file). The signal engine checks this flag on every signal event. The UI exposes a toggle.

**Complexity:** Low — one boolean check.

---

### 7. Paper Mode vs Live Mode Switch

**What:** A persistent configuration that routes all order placement to either `paper-api.alpaca.markets` or `api.alpaca.markets`. The Alpaca API surface is identical; only the base URL changes.

**Why critical:** Going live accidentally is catastrophic. The switch must be explicit, logged, and require confirmation in the UI.

**Alpaca API note (MEDIUM confidence):** Both paper and live Alpaca accounts use the same API key format and same endpoint structure. The only difference is the base URL and whether the account is funded. Paper accounts have simulated buying power.

**Implementation:** `tradingMode: "paper" | "live"` in config/DB. Paper URL: `https://paper-api.alpaca.markets`. Live URL: `https://api.alpaca.markets`. Already partially implemented — `config.alpacaPaperUrl` exists in `config.ts`.

**Complexity:** Low architecturally; HIGH in terms of testing discipline required before enabling.

---

### 8. Exit Strategy Implementation (Existing + Hardened)

**What:** The combination of exit conditions that close a position. The existing `paperTrader.ts` has trailing stop + hold deadline. This needs a hard stop loss added, and the combination needs to be fully researched.

**Recommended exit stack for catalyst-driven momentum plays (supported by practitioner consensus — MEDIUM confidence, no single authoritative academic source for intraday catalyst trading specifically):**

| Exit Condition | Trigger | When It Fires |
|---|---|---|
| Hard stop loss | Price drops X% from entry immediately | Fastest protection — fires before peak is established |
| Profit target (optional) | Price reaches Y% gain from entry | Lock in gains on explosive moves; use for M&A (deal price is ceiling) |
| Trailing stop | Price drops Z% from peak | The core momentum exit; fires when momentum exhausts |
| Time limit (hold deadline) | Max hold time expires | Cleanup — exits regardless of price |

**Sequencing matters:** All four should be checked in the same polling loop. Hard stop wins over trailing stop (it can fire before any peak). Profit target and trailing stop are complementary. Time limit is always the last resort.

**What research says about exit timing for fast catalyst plays:**

- FDA approval plays: peak typically occurs within 15-60 minutes of announcement (MEDIUM confidence — based on practitioner sources and existing strategy engine data design)
- M&A plays: peak within minutes to hours; price anchors near deal price per share; profit target is more reliable than trailing stop
- Earnings beats: slower momentum; peaks within 1-4 hours if no gap fade
- General catalyst momentum: the existing `strategyEngine.ts` is designed to compute `holdDurationSec` empirically from our own trade data — **this is the right approach and should be trusted over hardcoded values once 10+ trades exist per category**

**Exit % starting defaults (before strategy engine has data):**

| Parameter | Default | Rationale |
|---|---|---|
| Hard stop loss | 8% from entry | Generous enough to avoid noise; tight enough to limit damage |
| Profit target | 20% (optional, M&A tier1 only) | These have price targets from deal terms |
| Trailing stop activation | after price > entry | Already implemented — only activates after profitable |
| Trailing stop % | 3% (default from strategyEngine) | Strategy engine will tune this per category |
| Max hold time | 60-120 seconds (default) | Strategy engine will tune this per category |

**Complexity:** Medium — adding hard stop to existing loop is low; configuring per-category overrides is medium.

---

### 9. Order Fill Confirmation and Orphan Detection

**What:** The bot must verify that buy orders have filled before starting the exit monitor. If a buy fails or never fills, the position must not be tracked as open. Similarly, sell orders that fail must be retried.

**Why critical:** The existing `waitForFill()` in `paperTrader.ts` polls every 2 seconds for 10 seconds. This is fine for paper. For live markets, market orders fill almost instantly but the current implementation could miss edge cases.

**Requirements:**
- Log all order IDs, status transitions
- If buy order fails or times out: mark trade as error, do not open exit monitor
- If sell order fails: retry up to 3 times, then alert via broadcast
- Track `sellStatus: "error"` in DB (already in schema)

**Complexity:** Low to medium — mostly already implemented; needs retry logic on sell failures.

---

### 10. Bot Status Broadcast (WebSocket Events)

**What:** The bot must push status events to the frontend in real time: new signal evaluated (accepted/rejected), order placed, position opened, exit triggered, daily limit reached.

**Why critical:** Without live status, the user has no visibility into what the bot is doing. This is especially important for paper mode validation.

**Events needed:**
- `bot:signal_evaluated` — `{ ticker, catalyst, accepted: bool, reason: string }`
- `bot:position_opened` — `{ ticker, entryPrice, qty, strategy }`
- `bot:position_closed` — `{ ticker, exitPrice, pnl, reason: "trailing_stop" | "hard_stop" | "profit_target" | "hold_deadline" }`
- `bot:daily_limit_reached` — `{ dailyPnl, limit }`
- `bot:paused` / `bot:resumed`

**Complexity:** Low — reuse existing `broadcast()` infrastructure from `clientHub.ts`.

---

## Differentiators

Features that go beyond the minimum safe bot and provide meaningful edge.

### 1. Confidence-Gated Signal Thresholds

**What:** Instead of a binary tier filter, use the strategy engine's `confidence` score (0-1, based on sample size) to gate auto-trading. Low-confidence categories get a higher win-rate requirement. High-confidence categories (many historical trades) can trade with looser thresholds.

**Example:** `FDA_APPROVAL` with confidence 0.7 and win rate 60% → auto-trade. `ANALYST_UPGRADE` with confidence 0.1 (only 2 historical trades) → require manual confirmation or skip.

**Value:** Prevents over-trading on statistically weak signals; self-improving as data accumulates.

**Complexity:** Low — `strategyEngine.getStrategy()` already returns `confidence` and `winRate`. Wire into signal gate.

---

### 2. Bracket Orders for M&A / Hard Ceiling Catalyst Plays

**What:** For M&A acquisitions (TENDER_OFFER, MA_ACQUISITION), the deal price per share is the ceiling. Use Alpaca's native bracket orders (entry + take_profit + stop_loss) instead of a polling-based exit monitor.

**Why valuable:** M&A plays have a known ceiling (the deal price). A trailing stop often fires prematurely on normal volatility. A bracket order with `take_profit.limit_price` set near the deal price (extracted from the headline if possible) is more precise.

**Alpaca support confirmed (HIGH confidence):** Alpaca supports bracket orders with `take_profit` (contains `limit_price`) and `stop_loss` (contains `stop_price` and optional `limit_price`) fields on the order creation endpoint.

**Complexity:** High — requires deal price extraction from headline (NLP/regex), and bracket order API integration.

**Defer to v2** unless deal price parsing is already possible from catalyst classifier context.

---

### 3. VWAP-Relative Entry Filter

**What:** Only enter if the current price is not excessively extended above VWAP (VWAP deviation < configurable threshold, e.g., 15%). Entering when price is 30%+ above VWAP on a catalyst is a known reversion risk.

**Why valuable:** `tradeAnalytics.ts` already records `entryVwapDev`. Historical data will validate whether high VWAP deviation correlates with worse outcomes. This is a filter the strategy engine doesn't yet use.

**Complexity:** Low to medium — VWAP is already computed via `getVwapDev()`. Wire into signal evaluation.

---

### 4. Float-Aware Position Sizing

**What:** Nano-float stocks (<5M shares) move explosively on tiny volume. Larger positions in these stocks cause more slippage. Size down on low-float stocks.

**Position size modifier:**
- Float < 5M shares: multiply position size by 0.5
- Float < 20M shares: multiply by 0.75
- Float > 100M shares: full size

**Why valuable:** Nano-float catalyst plays (common in biotech/FDA) are the highest volatility, highest slippage situation. Smaller size compensates.

**Complexity:** Medium — requires fetching float data (Alpaca doesn't provide float; needs Polygon.io or similar). `TradeAnalytics.floatShares` is already in the schema but not populated.

**Defer to v2** until float data source is integrated.

---

### 5. News Source Quality Weighting

**What:** Weight signals differently based on news source quality. RTPR (press release direct) is highest quality. Benzinga secondary articles are lower confidence. Alpaca News aggregation is lower still.

**Rationale:** A direct press release from BusinessWire/PRNewswire via RTPR is the primary source. A secondary article from Benzinga about the same event is confirmation but not the signal itself.

**Complexity:** Low — `newsSource` is already tracked in `TradeAnalytics`. Add source weight to signal evaluation.

---

### 6. Per-Category Strategy Override UI

**What:** Allow manual override of the strategy engine's recommendations per catalyst category. E.g., "always use 5% hard stop for FDA_APPROVAL regardless of what strategy engine says."

**Why valuable:** In early phase (< 50 trades), the strategy engine's confidence is low. Manual overrides let the user encode their own knowledge while data accumulates.

**Complexity:** Medium — requires a strategy rule editor in the UI.

---

### 7. Signal Rejection Log with Replay

**What:** Every signal that was evaluated and rejected (too low win rate, wrong tier, scanner mismatch, daily limit reached) should be logged with reason. The user can review what the bot would have traded had thresholds been different.

**Why valuable:** Critical for validating threshold calibration without having to enable trading. Lets you ask "how many times did we skip FDA approvals in the last 30 days, and what would the outcome have been?"

**Complexity:** Medium — requires a `SignalEvent` database table and UI log view.

---

## Anti-Features

Things to deliberately NOT build in v1 of the autonomous bot.

### 1. Short Selling

**What:** Taking short positions (selling shares you don't own) to profit from downward catalyst moves.

**Why avoid:** Short selling has unlimited loss potential; requires margin account; PDT rules apply differently; Alpaca has stock-specific short availability constraints. Catalyst-driven momentum is primarily a long play. The `catalystClassifier.ts` danger patterns already catch negative catalysts ("guidance cut", "going concern") and block trades — the right behavior is to block, not short.

**What to do instead:** Skip negative catalyst events (already implemented via danger patterns).

---

### 2. Options Trading

**What:** Trading calls/puts on catalyst events.

**Why avoid:** FDA approval calls and earnings straddles are common strategies BUT options have complex pricing (IV crush is the #1 killer of "obvious" options plays around catalysts), require different APIs, and are explicitly out of scope in PROJECT.md.

**What to do instead:** Equity-only in v1. Options is a distinct milestone.

---

### 3. Multi-Symbol Backtesting Engine

**What:** Running the bot signal engine against historical data to simulate hypothetical trades.

**Why avoid:** Significantly more complex than running forward (look-ahead bias, survivor bias, data costs). The existing strategy engine uses real paper trade outcomes as its dataset — that IS the backtesting mechanism, just forward-looking.

**What to do instead:** Let paper trading accumulate real data. The strategy engine learns from actual outcomes.

---

### 4. Machine Learning / NLP on Headline Text

**What:** Training a model on headline text to predict catalyst strength beyond the keyword-rule-based `catalystClassifier.ts`.

**Why avoid:** Requires labeled training data (we don't have it yet), infrastructure complexity, and debugging difficulty. The existing rule-based classifier is accurate for the clear catalyst types (M&A, FDA, earnings) that represent the high-win-rate trades.

**What to do instead:** Improve keyword rules as misclassifications are discovered. Add ML in v3 once a large labeled dataset exists.

---

### 5. External Risk APIs / Real-Time News Sentiment Scoring

**What:** Integrating third-party sentiment scoring services (Benzinga sentiment, Bloomberg intelligence, etc.) to score catalyst quality.

**Why avoid:** External API dependencies add latency and cost. The existing news pipeline (RTPR + Benzinga) is already comprehensive. Sentiment APIs don't have a proven advantage over the keyword-based classifier for the specific catalyst types we trade.

**What to do instead:** Build on what's already there. Integrate better data sources (float, market cap) when specific gaps are identified.

---

### 6. Kelly Criterion or Dynamic Position Sizing

**What:** Algorithmically compute position size based on Kelly formula (`f = (bp - q) / b`) using win rate and payoff ratio.

**Why avoid for v1:** Kelly requires statistically reliable win rate and payoff ratio estimates. With < 50 trades per category, estimates are too noisy. Kelly also produces aggressive sizing that can be ruinous with estimation error. Kelly is appropriate in Phase 3 (200+ trades).

**What to do instead:** Fixed dollar risk per trade (see Table Stakes #5). Revisit Kelly in v3.

---

### 7. Complex Order Routing / DMA

**What:** Direct market access, order routing preferences, lit vs dark pool selection.

**Why avoid:** Not available via standard Alpaca API; requires institutional relationships; unnecessary complexity for retail catalyst plays which use market orders.

---

## Feature Dependencies

```
Signal Gate (#1) → Bot Enable/Disable (#6)
Signal Gate (#1) → Daily Max Loss Circuit Breaker (#3)
Signal Gate (#1) → Max Concurrent Positions (#4)
Signal Gate (#1) → Position Sizing (#5)
Signal Gate (#1) → Order Placement (paper or live)
Order Placement → Exit Stack (#8)
Exit Stack (#8) → Hard Stop (#2) [must add to existing]
Order Placement → Order Fill Confirmation (#9)
All Components → Bot Status Broadcast (#10)
Paper Mode (#7) → Live Mode (#7) [paper validates live]
```

---

## MVP Recommendation

The minimum viable bot for safe paper trading:

**Build in Phase 1 (paper validation):**
1. Hard stop loss — add to existing trailing stop monitor
2. Daily max loss circuit breaker
3. Max concurrent positions limit
4. Signal gate with configurable tier/win-rate threshold
5. Bot enable/disable control
6. Position sizing by dollar notional (not fixed share count)
7. Bot status broadcast events
8. Bot control UI panel

**Build in Phase 2 (live readiness):**
9. Paper → live mode switch (with explicit UI confirmation)
10. Order fill retry logic
11. Confidence-gated thresholds (uses accumulated paper trade data)
12. VWAP-relative entry filter (uses accumulated paper trade data)
13. Signal rejection log

**Defer to later phases:**
- Bracket orders for M&A (v2, complex)
- Float-aware sizing (v2, needs data source)
- Per-category override UI (v2)
- Options, shorting, Kelly, ML (explicit non-goals)

**Go-live gate (criteria to switch from paper to live):**
- [ ] 30+ paper trades completed successfully (bot entry AND exit, no orphaned positions)
- [ ] Win rate in paper >= 40% (viable signal quality)
- [ ] No unhandled exceptions in bot service for 5+ consecutive trading days
- [ ] Daily max loss circuit breaker tested (manually triggered)
- [ ] Hard stop loss tested (manually triggered via a real price drop in paper)
- [ ] Position sizing produces correct share counts at multiple price points
- [ ] Bot control panel shows accurate real-time state

---

## Risk Management Priority Stack

Ordered by severity of what happens if missing:

| Priority | Feature | Consequence If Missing |
|---|---|---|
| P0 | Hard stop loss | Losing trade holds full duration, unlimited downside within hold window |
| P0 | Bot enable/disable | Cannot stop bot during a live failure scenario |
| P0 | Paper → Live explicit switch | Accidental live trading during paper validation |
| P1 | Daily max loss circuit breaker | One bad catalyst day wipes multiple days of gains |
| P1 | Max concurrent positions | Correlated loss across simultaneous positions |
| P1 | Position sizing by dollar | $2 stock vs $50 stock get same dollar exposure (currently 10 shares of each) |
| P2 | Tier filter in signal gate | Bot trades low-quality catalysts (analyst upgrades, press releases) with poor win rate |
| P2 | Order fill confirmation | Orphaned sell-side monitor with no corresponding position |
| P3 | VWAP entry filter | Entering highly extended positions with reversion risk |
| P3 | Confidence gating | Over-trading on statistically underpowered signals |

---

## Exit Strategy: Research Summary

**Context:** The existing `strategyEngine.ts` is the primary exit strategy tool. It computes `holdDurationSec` and `trailingStopPct` from actual trade outcomes. This research validates the approach and adds the missing hard stop loss layer.

**Catalyst-specific exit patterns (MEDIUM confidence — practitioner consensus, not academic paper):**

**Tier 1: M&A / Acquisitions**
- Price spikes to near deal price within seconds-minutes of announcement
- Price anchors near deal price (arbitrage floor); limited upside beyond that
- Best exit: profit target near deal price OR trailing stop after initial spike
- Trailing stop 3-5% from peak works well (tight, because price anchors)
- Hard stop 5% from entry (acquirer backstop makes deep drops rare)
- Hold time: 1-5 minutes for initial spike capture

**Tier 2: FDA Approvals / Clinical Trial Success**
- Biotech FDA approvals: 30-200% spike possible in pre-market or first 30 minutes
- Price is volatile in both directions — reversal risk is high after initial spike
- Best exit: trailing stop 8-15% from peak (loose stop to allow volatility) + hard stop 10% from entry
- Hold time: 30-120 seconds for initial spike; longer holds expose to reversion
- The strategy engine's computed hold duration (currently defaults to 60s) is the right target to validate

**Tier 3: Earnings Beats / Revenue Records**
- Slower, more sustained moves than FDA/M&A
- Price discovery takes longer (market participants model impact)
- Best exit: trailing stop 5-8% from peak; hold time 2-5 minutes
- Hard stop 7% from entry

**Tier 4: Contracts / Analyst Upgrades / Partnerships**
- Smaller magnitude moves (5-20% typical)
- More prone to fading (analyst upgrades especially)
- Best exit: hard stop 8% from entry; trailing stop 5% from peak; hold 60-90 seconds
- Consider skipping analyst upgrades entirely (low tier confidence historically)

**What to defer to strategy engine:** All specific percentages above are starting defaults. The `strategyEngine.ts` is built to refine these per-category, per-cap-bucket, per-time-of-day from actual trade data. After 50+ trades per category, trust the engine over the hardcoded defaults.

---

## Sources

- Alpaca Markets docs (official): https://docs.alpaca.markets/docs/orders-at-alpaca/ — order types, bracket orders, trailing stops (HIGH confidence)
- Alpaca Markets docs: https://docs.alpaca.markets/reference/getaccount-1 — account risk fields including PDT status, buying power, daytrade_count (HIGH confidence)
- Alpaca Trading API overview: https://docs.alpaca.markets/docs/trading-api — fractional shares, paper trading, order types confirmed (HIGH confidence)
- Existing codebase analysis: `paperTrader.ts`, `strategyEngine.ts`, `catalystClassifier.ts`, `scanner.ts`, `tradeAnalytics.ts`, `schema.prisma` — authoritative source for what's already built (HIGH confidence)
- `config.ts` — confirms paper API URL `https://paper-api.alpaca.markets` vs live URL structure (HIGH confidence)
- Practitioner consensus on catalyst exit strategies: MEDIUM confidence — reflects standard day trading knowledge; no single authoritative academic source for intraday catalyst plays specifically; strategy engine will validate empirically
