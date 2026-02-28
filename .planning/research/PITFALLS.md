# Domain Pitfalls: Autonomous Trading Bot

**Domain:** Autonomous catalyst-driven day trading bot (Alpaca Markets, Node.js backend)
**Researched:** 2026-02-27
**Context:** Adding a server-side autonomous bot to an existing StockNews Day Trade Dashboard

---

## Critical Pitfalls

Mistakes that cause real financial losses, account suspensions, or full rewrites.

---

### Pitfall 1: Pattern Day Trader (PDT) Rule Violation

**What goes wrong:**
The SEC's PDT rule (FINRA Rule 4210) flags any account with less than $25,000 in equity that executes 4 or more "day trades" (same-day buy + sell of same security) within any rolling 5-business-day window. Once flagged, the account is locked to closing-only orders for 90 days. An autonomous bot that fires on catalyst news can easily burn through 4 day-trades in an hour on a busy news morning.

**Why it happens:**
- The bot treats every catalyst as independent — it does not track the rolling 5-day day-trade count
- A single FDA news morning can generate 5+ catalyst signals across different tickers
- Pre-market buys + market-hours sells count as day trades on the same calendar day
- The bot has no awareness of whether an exit is a closing trade or a day trade close

**Consequences:**
- Account locked for 90 days — bot cannot open new positions, destroying the value of the tool
- If the restriction is triggered repeatedly, broker may terminate the account
- Alpaca will reject orders with `ACCOUNT_RESTRICTED` but only AFTER the violation is committed

**Prevention:**
- Maintain a `dayTradeCounter` service that tracks: (a) open buy date per position, (b) how many round-trip same-day closes have occurred in the current 5-business-day window
- Hard gate: before any buy order, check `remainingDayTrades`. If `remainingDayTrades <= 1`, require explicit override or refuse new buys
- Display the PDT counter prominently in the bot control panel
- Use Alpaca's account endpoint (`GET /v2/account`) which returns `daytrade_count` and `pattern_day_trader` fields — poll this on startup and after every close
- For accounts under $25k: enforce a MAX_DAY_TRADES_PER_WEEK config (default: 3, leaving 1 buffer)

**Warning signs:**
- Bot fires multiple buys between 9:30–10:30 AM (highest catalyst frequency window)
- More than 2 positions opened and closed on the same day
- Alpaca account returns `daytrade_count` > 2 on a given day

**Phase:** Bot Risk Manager (Phase 1 of bot build — must be in place before any live trading)

---

### Pitfall 2: Stale News Triggering Trades on Old Catalysts

**What goes wrong:**
News WebSocket connections reconnect after drops. On reconnect, some providers replay recent articles (Alpaca News replays the last N articles from the stream). The bot sees an article published 45 minutes ago as "new" and fires a buy — but the 20% move already happened, and the bot is buying the top.

Additionally: the `created_at` timestamp on a news article is when the article was *published*, not when the WebSocket delivered it. A slow news API can deliver an article with a 3-minute-old timestamp that the bot treats as live.

**Why it happens:**
- The existing `seenIds` Set in `alpacaNews.ts` is in-memory only — it resets on server restart
- After a Docker container restart, ALL news from the current session appears "new"
- WebSocket reconnect handlers often replay the authentication message, which triggers resubscription and a replay burst
- No staleness check on article age before signal evaluation

**Consequences:**
- Bot buys a stock that has already spiked 25% — entering near the peak
- Maximum loss scenario: stock reverses immediately; bot's stop loss is hit; guaranteed loss on a "correct" catalyst

**Prevention:**
- Persist `seenIds` to the database (the `news_articles` table already exists). On startup, hydrate `seenIds` from the last 4 hours of DB records
- Add a `MAX_ARTICLE_AGE_SECONDS` config (recommend: 90 seconds). Before evaluating any article for a trade signal, check: `if (Date.now() - new Date(article.created_at).getTime() > MAX_ARTICLE_AGE_SECONDS * 1000) { skip; }`
- Add a `RECONNECT_COOLDOWN_SECONDS` (recommend: 30 seconds) — suppress signal evaluation on articles received within 30 seconds of a WebSocket reconnect event
- Log every skipped stale article with reason "STALE" for audit

**Warning signs:**
- Signal fires with article age > 2 minutes
- Multiple signals fire within seconds of a WebSocket reconnect
- Server restart followed by immediate trade activity

**Phase:** Signal Engine (must be before any paper or live trading is enabled)

---

### Pitfall 3: No Position State Persistence — Server Crash Mid-Trade

**What goes wrong:**
The bot opens a position. The server crashes (OOM, Docker restart, VPS reboot). On restart, the bot has no memory of the open position. It does not apply exit rules. The position sits open indefinitely. If the bot then sees another signal for the same ticker, it may buy again — doubling the position size without knowing it already holds shares.

**Why it happens:**
- In-memory position tracking (like the current `paperTrader.ts` likely uses a Map or array) is wiped on restart
- No reconciliation step on startup that compares bot's internal state with the broker's actual open positions
- The bot's "new order" logic doesn't check existing broker positions before buying

**Consequences:**
- A long-held, unmanaged position can lose far more than the designed stop loss (e.g., halted stock reopens down 40%)
- Double-buying creates a position 2x the intended size with 2x the risk
- In paper trading: misleading P&L because ghost positions aren't tracked
- In live trading: unmanaged positions can accumulate overnight and trigger margin calls

**Prevention:**
- On every startup, call `GET /v2/positions` (Alpaca) and reconcile with the bot's DB state. Any position that exists at the broker but not in the DB must be added to the DB as "orphaned" and trigger an immediate alert
- Store ALL open positions in the database with: `symbol`, `qty`, `avg_entry_price`, `opened_at`, `bot_order_id`, `alpaca_order_id`, `status`
- Before placing a buy order, query the DB for existing open positions in that symbol. Enforce a `MAX_POSITION_PER_SYMBOL = 1` rule
- On startup, the bot's first action must be `reconcilePositions()` before starting the signal listener
- Write a periodic heartbeat (every 60 seconds) that writes current bot state to the DB, so crash recovery knows the last known good state

**Warning signs:**
- Container restart logs followed by absence of exit order for a known position
- Alpaca `/v2/positions` returns a position the bot's DB doesn't know about
- `GET /v2/account` shows non-zero equity that doesn't match bot's tracked positions

**Phase:** Bot Executor (Phase 1 — foundational, cannot ship without this)

---

### Pitfall 4: Ghost Fills and Partial Fills Breaking Position Math

**What goes wrong:**
The bot places a market order for 100 shares. Alpaca fills it in two partial fills: 60 shares at $5.10, 40 shares at $5.12. The bot calculates its average entry as $5.10 (the price of the first fill event it received). The stop loss is calculated on wrong math. Or the bot sets a stop order for 100 shares based on the first fill, but the second 40 shares were never included.

"Ghost fills" occur when the bot places an order, the connection drops, and the bot never receives the fill confirmation — so it considers the order unfilled while the broker has already executed it.

**Why it happens:**
- Alpaca's WebSocket `trade_updates` stream delivers fill events per-execution, not per-order
- A single order can generate multiple `fill` and `partial_fill` events
- If the bot is not subscribed to `trade_updates` or loses the connection at the wrong moment, it misses fill events
- Market orders during low-liquidity opens (especially small-cap stocks under $5) are highly prone to multiple partial fills

**Consequences:**
- Exit orders placed for wrong quantity — either under-sells (leaving a partial position orphaned) or over-sells (short position accidentally opened)
- Average entry price is wrong — stop loss and profit target calculations are off
- Ghost fills: bot tries to place a new order for the same symbol and gets rejected (position already exists) or creates a double position

**Prevention:**
- Never calculate position state from WebSocket fill events alone. After receiving any fill/partial_fill event, immediately call `GET /v2/positions/{symbol}` to get the authoritative position
- Store partial fill state: track `qty_filled` vs `qty_ordered`. Only consider a position "fully open" when `qty_filled === qty_ordered`
- For exit orders: always query the current position quantity before placing a sell order, rather than trusting the locally-tracked quantity
- Implement a fill timeout: if an order has been "pending" for more than N seconds without a fill event, poll `GET /v2/orders/{order_id}` to get ground truth
- Subscribe to Alpaca's `trade_updates` WebSocket stream (separate from the market data stream) and handle all event types: `new`, `fill`, `partial_fill`, `canceled`, `expired`, `rejected`, `pending_cancel`

**Warning signs:**
- Order status shows `partially_filled` for more than 30 seconds
- Bot's tracked position qty doesn't match `GET /v2/positions/{symbol}`
- Exit order gets rejected with `qty_insufficient` error

**Phase:** Bot Executor (order state machine — must be built before live trading)

---

### Pitfall 5: Runaway Bot — Compounding Bad Signals

**What goes wrong:**
A bad catalyst signal fires. The bot buys. The stop loss is hit. The bot takes a loss. A second signal fires on the same type of catalyst (or same ticker if the halt lifted). The bot buys again. Repeat. In a volatile pre-market session with multiple FDA-adjacent news items, the bot can cycle through 5 losing trades in 30 minutes, hitting the daily loss limit from the wrong direction.

More dangerous variant: the position sizing logic has a bug. Instead of buying $500 of stock, it buys $5,000 (e.g., a missing division or a wrong field lookup). The first trade is 10x oversized and wipes 10x more capital.

**Why it happens:**
- No daily loss ceiling at the bot level (only at the account level, which is far higher)
- Signal deduplication is inadequate — the same news story can trigger multiple signals via different news sources (RTPR, Benzinga, Alpaca News) for the same article
- Position sizing uses a variable (price, account equity) that returns an unexpected value
- No "cool-down" period after a stop-loss hit that would suppress new signals for the same ticker

**Consequences:**
- Significant real-money losses in minutes
- Account equity drops below $25k PDT threshold, locking the account
- In worst case: full account wipeout if position sizing is uncapped and market is thin

**Prevention:**
- Implement a `DAILY_MAX_LOSS_USD` circuit breaker (e.g., $500). Track cumulative realized losses for the current calendar day. If `dailyLoss >= DAILY_MAX_LOSS_USD`, halt ALL new buys and alert the user
- Implement `DAILY_MAX_TRADES` limit (e.g., 5 per day). Stop accepting new signals after this is reached
- Implement cross-source deduplication: when a news article arrives, hash the (symbol + catalyst_type + article_date) — not just the article ID — so the same story from Benzinga and Alpaca News only triggers one signal evaluation
- After any losing trade (stop hit), impose a `TICKER_COOLDOWN_MINUTES` (e.g., 60 minutes) during which that ticker cannot be re-entered
- Position sizing must use a fixed formula: `shares = floor(POSITION_SIZE_USD / currentPrice)`. Never use equity-percentage sizing without an absolute cap
- Log every position size calculation with inputs for audit
- Deploy with conservative defaults: `POSITION_SIZE_USD = 100`, `MAX_CONCURRENT_POSITIONS = 2` for first 30 days

**Warning signs:**
- Same ticker triggers two buys within 10 minutes
- Daily trade count exceeds 3
- Realized P&L for the day drops more than $200
- Position size is more than 2x the configured `POSITION_SIZE_USD`

**Phase:** Risk Manager (must be in place before paper trading; enforced live from day 1)

---

### Pitfall 6: Market Halt and Circuit Breaker — Positions Trapped

**What goes wrong:**
The bot buys a stock on a catalyst. That stock is then halted (Limit Up/Limit Down, regulatory halt, news pending halt). During the halt, the bot's exit orders are queued but not executed. The halt can last minutes or hours. When trading resumes, the price may open 30–50% lower than the halt price (bad news confirmed, or the initial move was a pump).

Market-wide circuit breakers (Level 1: 7%, Level 2: 13%, Level 3: 20% decline in S&P 500) halt ALL trading for 15 minutes or the rest of the day. During this time, ALL exit orders are frozen.

**Why it happens:**
- Small-cap stocks with FDA/M&A catalysts are the most frequently halted stocks — they are the exact stocks this bot targets
- The bot places a stop order, but stop orders do not execute during a halt
- After a halt lifts, the first print can be dramatically different from pre-halt price — stop orders execute at market on resumption, which may be far below the stop price

**Consequences:**
- Position opens significantly below stop price — stop order provided no real protection
- Bot holds a large unrealized loss with no automatic remedy
- Multiple halted positions simultaneously (common in volatile sessions) creates cascading losses on resumption

**Prevention:**
- Accept this as an unavoidable risk in catalyst trading — it cannot be fully eliminated
- Mitigate with position sizing: if each position is at most $500 and the worst case is -100%, maximum halt-related loss per position is $500
- Monitor halt status: Alpaca's market data includes trade conditions; a `T` condition code typically indicates a halt. Subscribe to the `trade_updates` stream and watch for halt notifications
- Implement a "halt detected" handler: when a halt is detected on an open position, alert the user immediately (push notification to dashboard) and wait for manual override or automated resume logic
- Configure `MAX_CONCURRENT_POSITIONS = 2` to limit simultaneous halt exposure
- Do NOT place stop-limit orders (they will not fill if price gaps below the limit). Use stop-market orders instead, acknowledging slippage risk

**Warning signs:**
- Alpaca order shows `held` status for more than 60 seconds during market hours
- No trade prints for a held position for 2+ minutes during market hours
- LULD (Limit Up/Limit Down) band breach visible in market data

**Phase:** Auto Exit Manager (design for halt tolerance from the start)

---

### Pitfall 7: Alpaca API Rate Limits Causing Missed Orders

**What goes wrong:**
The bot makes multiple API calls per signal: fetch price, place order, subscribe to updates, poll position status. Under load (multiple signals firing simultaneously), the bot hits Alpaca's rate limits and receives 429 responses. If the bot does not handle 429 correctly — and the order call is one of the throttled calls — an order silently fails to place while the bot believes it succeeded.

Alpaca rate limits (as of 2025): ~200 requests/minute for the trading API, ~1000/minute for the market data API.

**Why it happens:**
- Multiple news sources fire simultaneously on a major catalyst (FDA announcement pre-open)
- The bot evaluates every signal synchronously without a request queue
- No retry logic on 429 responses — the error is caught and swallowed
- Position status polling during a fill compound the rate consumption

**Consequences:**
- Order not placed — missed opportunity (acceptable loss)
- Or worse: order placed but position status poll returns 429, bot retries indefinitely, exit logic stalls
- In degraded state: bot's internal state diverges from actual broker state

**Prevention:**
- Implement a simple request queue with rate limiting: max 3 concurrent Alpaca trading API calls
- On 429: exponential backoff with jitter (start at 1s, max at 30s, max 3 retries)
- On 429 for an ORDER placement: treat as critical failure, log prominently, alert user, do NOT retry automatically (placing duplicate orders is worse than missing one)
- Monitor Alpaca's `X-RateLimit-Remaining` response headers and back off proactively when below 20% remaining
- Use a single polling interval for position status rather than per-position polls

**Warning signs:**
- HTTP 429 responses in logs
- Order confirmation delays > 5 seconds
- Position state diverges from Alpaca's state

**Phase:** Bot Executor (build request queue as part of Alpaca client abstraction)

---

### Pitfall 8: Pre-Market and Opening Auction Edge Cases

**What goes wrong:**
The bot is configured to watch for news from 4 AM ET onward. It sees a catalyst at 6:30 AM and places a buy order. Depending on the order type:
- A market order before 9:30 AM will be **rejected** by Alpaca unless `extended_hours: true` is set
- A limit order in pre-market has very wide spreads on small-caps — the bot may overpay by 5-10%
- Orders placed at 9:29:50 AM may execute at the opening auction price (the first print), which can be 15-20% above the pre-market price — the bot "buys the open" which is often the worst price of the session

**Why it happens:**
- The bot logic doesn't distinguish between extended hours (4 AM–9:30 AM, 4 PM–8 PM) and regular market hours
- Alpaca's `extended_hours` flag must be explicitly set for pre-market orders, and it only works with limit orders (market orders in extended hours are rejected outright)
- The opening auction creates an artificial price spike in the first 60-90 seconds of the regular session — this is the most common "bag-holding" entry point

**Consequences:**
- Pre-market market orders rejected silently — bot thinks order is placed, position never opens
- Pre-market limit orders filled at a price 10% above the previous close, inflating entry cost before the real move happens
- Opening auction entry means buying the spike top, not the catalyst move

**Prevention:**
- Enforce a `TRADING_HOURS` check in the signal evaluation step. Define three windows:
  1. Pre-market (4:00–9:30 AM ET): allow only limit orders with `extended_hours: true`, or queue for market open
  2. Opening (9:30–9:45 AM ET): suppress new buys entirely — wait for post-auction price stabilization
  3. Regular hours (9:45 AM–3:45 PM ET): full operation
  4. End of day (3:45–4:00 PM ET): suppress new buys (avoid holding overnight accidentally)
- Use market timezone awareness: the server runs UTC; all time comparisons must use ET (America/New_York) with proper DST handling
- Log every order with the market session it was placed in

**Warning signs:**
- Orders placed between 9:30:00 and 9:45:00 AM ET
- Order rejection with reason `market_not_open`
- Fills within 90 seconds of market open

**Phase:** Signal Engine and Bot Executor (session-aware logic must be designed upfront)

---

## Moderate Pitfalls

---

### Pitfall 9: Wash Sale Rule (Tax Implication — Not a Trading Block)

**What goes wrong:**
The bot buys a stock, takes a loss, then buys the same stock within 30 days (before or after the losing sale). The IRS wash sale rule disallows the tax deduction for that loss — it gets added to the cost basis of the replacement purchase instead. A bot that cycles through the same momentum tickers repeatedly (MSTR, AAPL, GME) can create a wash sale situation dozens of times per year.

**Why it happens:**
- The bot has no awareness of tax lots or wash sale windows
- Catalyst stocks that generate frequent signals (biotech names that announce FDA decisions quarterly) will trigger the same ticker repeatedly
- The TICKER_COOLDOWN after a stop loss (Pitfall 5 mitigation) covers 60 minutes, not the 30-day wash sale window

**Consequences:**
- Real financial cost: losses are deferred to a different tax year or disallowed entirely
- No operational consequence — trades still execute; this is a tax-time problem

**Prevention:**
- This is a personal-use tool — the user controls it and bears the tax consequence
- Document in the UI: show a "wash sale warning" indicator when a new signal fires for a ticker that had a losing exit within the past 30 days
- Log all trades with `symbol`, `entry`, `exit`, `pnl`, `exit_date` — Alpaca also provides 1099-B data that includes wash sale adjustments
- Consider adding a `WASH_SALE_BLOCK` config option (default: off) that prevents re-entry within 31 days of a losing exit for the same ticker

**Phase:** Analytics / Post-MVP enhancement (not a launch blocker; document the risk)

---

### Pitfall 10: Duplicate Signal from Multiple News Sources

**What goes wrong:**
RTPR, Benzinga, and Alpaca News all carry the same press release. The bot receives the same news three times within 500ms (each through a different WebSocket). It evaluates each as an independent signal and places three separate buy orders for the same ticker.

**Why it happens:**
- The existing system fans news from all three sources into the same clientHub. The same article has different `id` fields per source.
- The signal engine checks per-article IDs, but the same story has different IDs across sources
- Network jitter means the three deliveries arrive within a window where cross-source deduplication hasn't fired yet

**Consequences:**
- 3x the intended position size in the same ticker
- 3x the PDT exposure if the position is exited same-day
- Alpaca may partially reject the duplicate orders (if the position check is fast enough) or partially fill them

**Prevention:**
- Implement cross-source deduplication by (symbol, catalyst_type, article_date_truncated_to_minute)
- Maintain an in-memory `recentSignals` Map: key = `${symbol}:${catalystType}:${dateMinute}`, value = timestamp. If a matching key exists within the last 5 minutes, suppress the signal
- The signal evaluation must be serialized for the same ticker — use a per-ticker mutex or queue

**Phase:** Signal Engine (required before paper or live trading)

---

### Pitfall 11: Alpaca Order Rejection Scenarios Not Handled

**What goes wrong:**
Alpaca rejects orders for many reasons that the bot may not anticipate:
- `insufficient_funds` — account buying power exhausted
- `asset_not_tradable` — stock is halted, OTC-only, or delisted
- `qty_is_zero` — position sizing logic returned 0 shares (stock price > position size budget)
- `account_restricted` — PDT flag triggered (see Pitfall 1)
- `outside_market_hours` — market order placed in extended hours without flag
- `order_not_cancelable` — cancel request sent for already-filled order

**Why it happens:**
- Bot treats a 200 OK from the order endpoint as success; actual fill confirmation requires checking the response body for `status`
- Error responses have different codes and require specific handling, not a generic catch-all
- Some rejections are transient (rate limit); others are permanent (asset delisted)

**Consequences:**
- Bot believes position is open when it isn't — exit logic fires for a non-existent position
- Bot believes position is closed when it isn't — no exit logic fires for a live position

**Prevention:**
- Parse every order response. Check `status` field: only `new`, `accepted`, `pending_new` are optimistic states
- `rejected` status requires immediate position state correction and user alert
- Implement a `validateOrder()` pre-check: confirm buying power > position size, asset is tradable, market session is valid — BEFORE placing the order
- Map all known Alpaca error codes to human-readable bot state transitions

**Phase:** Bot Executor (defensive coding from the start)

---

### Pitfall 12: Overnight Position Accumulation

**What goes wrong:**
The bot buys a position at 3:55 PM ET. The exit order (stop loss or profit target) is placed as a day order. Day orders expire at market close (4:00 PM ET). The exit order expires. The position is now held overnight with no protection. Overnight news (FDA rejection, earnings miss) causes a 40% gap-down at the next open.

**Why it happens:**
- Exit orders placed as `day` type expire at close automatically
- The bot's exit manager may not re-evaluate open positions at market open the next day
- If the server restarts overnight, position reconciliation (Pitfall 3) must handle "orphaned overnight positions" and immediately re-apply exit rules

**Consequences:**
- Unprotected overnight position — catalyst trading is specifically a same-day strategy
- Gap-down on next open may be far below any stop level

**Prevention:**
- At 3:45 PM ET, check all open positions. If any remain open: attempt to close at market immediately (before close) with a warning alert
- If a position cannot be closed (halt, insufficient time): alert the user explicitly with current P&L and risk exposure
- Re-examine open positions at 9:30 AM ET the next day and immediately re-apply exit logic
- Configure exit orders as `gtc` (good-till-cancelled) rather than `day` — but then implement explicit cancellation when exit conditions change

**Phase:** Auto Exit Manager (required before live trading; high financial risk)

---

## Minor Pitfalls

---

### Pitfall 13: Timezone Bugs in Market Hours Logic

**What goes wrong:**
The server runs UTC. All time comparisons use `new Date()` without timezone conversion. Market open (9:30 AM ET) is 14:30 UTC in winter and 13:30 UTC in summer (DST). A hard-coded UTC comparison that worked in January breaks in March when DST changes.

**Prevention:**
- Use a proper timezone library (Luxon or `date-fns-tz`) with `America/New_York` for ALL market hours checks
- Never hard-code UTC offsets — always compute from the IANA timezone database
- Test market hours logic across DST boundary dates (second Sunday in March, first Sunday in November)

**Phase:** Signal Engine (implement correctly from day 1)

---

### Pitfall 14: Catalyst False Positives on Headline Parsing

**What goes wrong:**
The catalyst classifier sees "FDA" in a headline and classifies it as a positive FDA catalyst. But the headline is "FDA Issues Warning Letter to [Company]" — a negative catalyst. The bot buys. The stock drops 30%.

**Prevention:**
- The existing catalyst classifier should include sentiment scoring alongside category
- Before a buy, require: (a) catalyst category matches configured signal types AND (b) sentiment is positive (no warning, rejection, failure keywords)
- Add a sentiment blocklist to the signal engine: headlines containing "warning letter", "rejected", "hold", "delay", "investigation", "lawsuit" should suppress the buy signal regardless of catalyst category

**Phase:** Signal Engine (must be part of catalyst-to-signal translation layer)

---

### Pitfall 15: Paper Trading Results Don't Reflect Real Slippage

**What goes wrong:**
Paper trading fills at the mid-price or last trade price. Real market orders on small-caps fill at the ask (or worse, multiple prices above the ask for large orders). A bot that performs well in paper mode may lose money in live mode purely due to slippage.

**Prevention:**
- In paper trading, add a configurable slippage model: simulate fills at `lastPrice * (1 + SLIPPAGE_PCT)` for buys (e.g., 0.5-1% for small caps)
- Track paper trade fill prices vs actual bid/ask spread to estimate real-world execution cost
- Never graduate to live trading until paper results account for realistic slippage

**Phase:** Paper trading (build slippage simulation before live handoff)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Signal Engine | Stale news triggers trades (Pitfall 2) | Article age check + reconnect suppression |
| Signal Engine | Multi-source duplicate signals (Pitfall 10) | Cross-source dedup by (symbol, type, minute) |
| Signal Engine | Catalyst false positives (Pitfall 14) | Sentiment blocklist |
| Signal Engine | Timezone DST bug (Pitfall 13) | Use Luxon/date-fns-tz with IANA timezone |
| Bot Executor | Ghost fills break position math (Pitfall 4) | Always reconcile with GET /v2/positions |
| Bot Executor | Order rejections silently ignored (Pitfall 11) | Parse every response; handle all rejection codes |
| Bot Executor | Rate limit causing missed orders (Pitfall 7) | Request queue + 429 backoff |
| Bot Executor | State lost on server crash (Pitfall 3) | DB persistence + startup reconciliation |
| Risk Manager | PDT rule violation (Pitfall 1) | Day trade counter before every buy |
| Risk Manager | Runaway bot (Pitfall 5) | Daily loss limit + daily trade cap + cooldowns |
| Auto Exit Manager | Position trapped in halt (Pitfall 6) | Alert user; accept halt risk; limit position size |
| Auto Exit Manager | Overnight position accumulation (Pitfall 12) | 3:45 PM force-close check |
| Pre-Launch (live) | Paper trade results misleading due to slippage (Pitfall 15) | Add slippage model to paper fills |
| Post-Launch | Wash sale tax impact (Pitfall 9) | UI warning; log all trades; document |

---

## Regulatory Reference

| Rule | Applies To | Consequence | Mitigation |
|------|-----------|-------------|------------|
| PDT Rule (FINRA 4210) | Accounts < $25,000 | 90-day trading restriction | Day trade counter; hard gate at 3 day trades |
| Wash Sale (IRS) | All accounts | Loss deduction disallowed | UI warning; optional 31-day re-entry block |
| Pattern Day Trader designation | Same | Margin maintenance requirements | Monitor `pattern_day_trader` field in account API |
| LULD Circuit Breakers | All stocks | Orders queued/rejected during halt | Halt detection; position size limits |
| Market-Wide Circuit Breakers | All accounts | No trading for 15 min to rest of day | Alert user; hold all pending signals |

---

## Sources

- Confidence: HIGH (from domain expertise in trading systems, Alpaca documentation patterns, and regulatory rules)
- Alpaca API order states and rate limits: knowledge based on Alpaca v2 trading API documentation (HIGH confidence on fundamentals; verify specific rate limits against current Alpaca docs before implementation)
- PDT Rule: SEC/FINRA official regulatory rule — well-established, unchanged for 20+ years (HIGH confidence)
- Wash Sale Rule: IRS Section 1091 — established tax law (HIGH confidence)
- LULD Circuit Breakers: SEC Rule 80B and NMS Plan to Address Extraordinary Market Volatility (HIGH confidence on existence; specific thresholds should be confirmed with current SEC/FINRA documentation)
- Alpaca order rejection codes: based on Alpaca v2 API patterns (MEDIUM confidence — verify specific error messages against current Alpaca docs)
