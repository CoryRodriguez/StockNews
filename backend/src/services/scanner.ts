/**
 * Scanner engine
 * Polls Alpaca REST every 30 seconds, evaluates filter rules,
 * and emits alerts to connected clients via the clientHub.
 */
import { getSnapshots, getMostActives, getTopMovers, Snapshot } from "./alpaca";
import { broadcast } from "../ws/clientHub";
import { enrichWithFloat, FloatData } from "./floatData";
import { recentArticles } from "./rtpr";
import { evaluateScannerRows } from "./scannerTrader";

export { Snapshot };

export interface ScannerDefinition {
  id: string;
  name: string;
  filter: (s: Snapshot) => boolean;
}

const SCANNERS: ScannerDefinition[] = [
  {
    id: "gap_up",
    name: "Gap Up Pre-Market",
    filter: (s) => s.gapPct >= 5 && s.price > 0 && s.price <= 50 && s.volume > 5_000,
  },
  {
    id: "gap_down",
    name: "Gap Down Pre-Market",
    filter: (s) => s.gapPct <= -5 && s.price >= 1 && s.volume > 10_000,
  },
  {
    id: "high_rvol",
    name: "High Relative Volume",
    filter: (s) => s.relativeVolume >= 3 && s.volume > 50_000,
  },
  {
    id: "momentum",
    name: "Momentum Mover",
    filter: (s) => s.changePct >= 5 && s.volume > 100_000,
  },
  {
    id: "big_gainer",
    name: "Big % Gainer",
    filter: (s) => s.changePct >= 10,
  },
  {
    id: "big_loser",
    name: "Big % Loser",
    filter: (s) => s.changePct <= -10,
  },
];

export function getScannerDefinitions() {
  return SCANNERS.map(({ id, name }) => ({ id, name }));
}

export function getCurrentAlerts(): Record<string, Snapshot[]> {
  const result: Record<string, Snapshot[]> = {};
  for (const [scannerId, snapMap] of alertState) {
    result[scannerId] = [...snapMap.values()];
  }
  return result;
}

/** Returns the IDs of scanners that currently have this ticker on alert */
export function getActiveScannersForTicker(ticker: string): string[] {
  const result: string[] = [];
  for (const [scannerId, tickers] of alertState) {
    if (tickers.has(ticker)) result.push(scannerId);
  }
  return result;
}

// Track current alert state per scanner to avoid duplicate emissions
const alertState = new Map<string, Map<string, Snapshot>>(); // scannerId → Map<ticker, Snapshot>
for (const s of SCANNERS) alertState.set(s.id, new Map());

// ── Daily session reset (clear stale alerts at 4 AM ET each day) ─────────
let lastSessionDate = "";

function getCurrentSessionDate(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  // Session starts at 4:00 AM ET — before 4 AM is still the prior session
  if (et.getHours() < 4) et.setDate(et.getDate() - 1);
  return et.toISOString().split("T")[0];
}

function resetIfNewSession() {
  const sessionDate = getCurrentSessionDate();
  if (sessionDate !== lastSessionDate) {
    for (const [, map] of alertState) map.clear();
    lastSessionDate = sessionDate;
    broadcast("scanner_control", { type: "scanner_session_reset" });
    console.log(`[Scanner] New session ${sessionDate} — alerts cleared`);
  }
}

// ── Screener universe (full snapshot set, pre-filter) ────────────────────

export interface ScreenerRow {
  ticker: string;
  price: number;
  prevClose: number;
  open: number;
  changePct: number;
  gapPct: number;
  volume: number;
  avgVolume30d: number;
  relativeVolume: number;
  high: number;
  low: number;
  hasNews: boolean;
  float: number | null;
  shortInterest: number | null;
  marketCap: number | null;
  sector: string | null;
  newsHeadline: string | null;
}

let screenerRows: ScreenerRow[] = [];

/** Returns the full screener universe enriched with float data */
export function getScreenerRows(): ScreenerRow[] {
  return screenerRows;
}

function buildScreenerRows(snapshots: Snapshot[], floatMap: Map<string, FloatData>): ScreenerRow[] {
  return snapshots.map((s) => {
    const fd = floatMap.get(s.ticker);
    // Find latest headline for this ticker
    const article = recentArticles.find((a) => a.ticker === s.ticker);
    return {
      ticker: s.ticker,
      price: s.price,
      prevClose: s.prevClose,
      open: s.open,
      changePct: s.changePct,
      gapPct: s.gapPct,
      volume: s.volume,
      avgVolume30d: s.avgVolume30d,
      relativeVolume: s.relativeVolume,
      high: s.high,
      low: s.low,
      hasNews: s.hasNews,
      float: fd?.float ?? null,
      shortInterest: fd?.shortInterest ?? null,
      marketCap: fd?.marketCap ?? null,
      sector: fd?.sector ?? null,
      newsHeadline: article?.title ?? null,
    };
  });
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startScanner() {
  if (!process.env.ALPACA_API_KEY) {
    console.warn("[Scanner] No Alpaca key — scanners disabled");
    return;
  }
  runScan();
  pollInterval = setInterval(runScan, 30_000);
}

async function runScan() {
  try {
    resetIfNewSession();

    const [actives, movers] = await Promise.all([
      getMostActives(),
      getTopMovers(),
    ]);
    // Merge both sources, deduplicate
    const symbolSet = new Set([...actives, ...movers]);
    const allSymbols = [...symbolSet];
    if (!allSymbols.length) return;

    const snapshots = await getSnapshots(allSymbols);

    // Enrich with float data and build screener universe
    const floatMap = await enrichWithFloat(allSymbols);
    screenerRows = buildScreenerRows(snapshots, floatMap);
    broadcast("screener", { type: "screener_update", rows: screenerRows });

    // Evaluate scanner trading criteria (fire-and-forget, never blocks scan loop)
    void evaluateScannerRows(screenerRows).catch(err =>
      console.error('[Scanner] Scanner trader evaluation error:', err)
    );

    for (const scanner of SCANNERS) {
      const current = alertState.get(scanner.id)!;
      const nowMatching = new Map<string, Snapshot>();

      for (const snap of snapshots) {
        if (scanner.filter(snap)) {
          nowMatching.set(snap.ticker, snap);

          // Only emit if this is a new alert for this scanner
          if (!current.has(snap.ticker)) {
            broadcast(`scanner:${scanner.id}`, {
              type: "scanner_alert",
              scannerId: scanner.id,
              ...snap,
            });
          }
        }
      }

      // Emit clear events for tickers that fell off the scanner
      for (const [ticker] of current) {
        if (!nowMatching.has(ticker)) {
          broadcast(`scanner:${scanner.id}`, {
            type: "scanner_clear",
            scannerId: scanner.id,
            ticker,
          });
        }
      }

      alertState.set(scanner.id, nowMatching);
    }
  } catch (err) {
    console.error("[Scanner] Poll error:", err);
  }
}
