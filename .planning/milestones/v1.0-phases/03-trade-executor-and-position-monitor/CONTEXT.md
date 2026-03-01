# Phase 3 Context: Trade Executor and Position Monitor

Generated from discuss-phase conversation on 2026-02-28.

---

## Position Sizing

**Dollar amounts per star rating (flat, not multipliers):**
- 3-star signal → $50
- 4-star signal → $75
- 5-star signal → $100
- 1–2 star (low confidence) → **skip entirely**, do not enter trade

**Storage:** All dollar amounts stored in BotConfig table (database), fully configurable without code changes.

---

## Position Limits

**No cap on simultaneous open positions.** Trade every qualifying signal (3+ stars).

Rationale: The right number of positions depends on signal frequency and quality, which is unknown until we have historical data. Let the signals determine position count naturally. Adapt over time.

**Historical data is critical:** The goal is to accumulate trade and catalyst data so we can identify which news catalyst types drive the largest moves and refine strategy accordingly. This is likely a Phase 5 analytics concern but the data must be captured from Phase 3 onward.

---

## Duplicate Signals

If the bot receives a second signal for a symbol it **already has an open position in**, **skip it.** The goal is to be in the stock on first article. A second signal means we're already positioned (or should be).

---

## Exit Conditions (All Configurable via BotConfig)

All exit thresholds are stored in the BotConfig table so they can be tuned as historical data accumulates. No hardcoded defaults.

| Exit Type | Setting | Notes |
|-----------|---------|-------|
| Hard stop loss | `stopLossPct` | e.g. -5% from entry. Immediate market sell. |
| Profit target | `profitTargetPct` | e.g. +10% from entry. Lock in gains. |
| Max hold time | `maxHoldMinutes` | Time-based exit regardless of P&L. |
| Trailing stop | (future) | May add trailing stop logic; defer to config too. |

**Decision philosophy:** Don't hardcode percentages now. Watch the bot trade in paper mode, analyze the data, then set optimal values. All configurable = no code deploys needed to tune behavior.

---

## EOD Force-Close

**Always force-close all positions at 3:45 PM ET.** No exceptions, no toggle.

- Uses `node-cron` scheduled job
- Closes ALL open positions regardless of P&L
- Runs before market close to ensure fills
- This is a hard rule for the paper trading phase; revisit if overnight holding is ever desired

---

## Crash Recovery

On startup (or bot restart), reconcile DB state against live Alpaca positions via `GET /v2/positions`.

**Orphan positions** (in Alpaca but no DB record):
- **Log a warning** (so the operator knows something unexpected happened)
- **Import them as tracked positions** — adopt them so the bot can manage exits (stop, target, EOD close)
- Do NOT leave unmanaged positions in Alpaca

**DB positions with no Alpaca counterpart** (closed externally):
- Mark them as closed in DB with a note that they were reconciled, not exited normally

---

## Summary of BotConfig Keys Needed

| Key | Type | Purpose |
|-----|------|---------|
| `tradeSizeStars3` | number | Dollar amount for 3-star trades |
| `tradeSizeStars4` | number | Dollar amount for 4-star trades |
| `tradeSizeStars5` | number | Dollar amount for 5-star trades |
| `stopLossPct` | number | Hard stop loss % (negative, e.g. -5) |
| `profitTargetPct` | number | Profit target % (positive, e.g. 10) |
| `maxHoldMinutes` | number | Max position hold time in minutes |

---

## Out of Scope for Phase 3

- PDT rule enforcement → Phase 4 (Risk Management)
- Capital allocation limits / max daily loss → Phase 4
- Live trading mode → Phase 6
- UI / dashboard for viewing trades → Phase 5
- Catalyst analytics / which news type drives biggest moves → Phase 5
