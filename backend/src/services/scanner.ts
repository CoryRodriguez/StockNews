/**
 * Scanner engine
 * Polls Alpaca REST every 30 seconds, evaluates filter rules,
 * and emits alerts to connected clients via the clientHub.
 */
import { getSnapshots, getMostActives, Snapshot } from "./alpaca";
import { broadcast } from "../ws/clientHub";

export interface ScannerDefinition {
  id: string;
  name: string;
  filter: (s: Snapshot) => boolean;
}

const SCANNERS: ScannerDefinition[] = [
  {
    id: "gap_up",
    name: "Gap Up Pre-Market",
    filter: (s) => s.gapPct >= 5 && s.price >= 1 && s.price <= 50 && s.volume > 10_000,
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

/** Returns the IDs of scanners that currently have this ticker on alert */
export function getActiveScannersForTicker(ticker: string): string[] {
  const result: string[] = [];
  for (const [scannerId, tickers] of alertState) {
    if (tickers.has(ticker)) result.push(scannerId);
  }
  return result;
}

// Track current alert state per scanner to avoid duplicate emissions
const alertState = new Map<string, Set<string>>(); // scannerId → Set<ticker>
for (const s of SCANNERS) alertState.set(s.id, new Set());

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
    const actives = await getMostActives();
    if (!actives.length) return;

    const snapshots = await getSnapshots(actives);

    for (const scanner of SCANNERS) {
      const current = alertState.get(scanner.id)!;
      const nowMatching = new Set<string>();

      for (const snap of snapshots) {
        if (scanner.filter(snap)) {
          nowMatching.add(snap.ticker);

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
      for (const ticker of current) {
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
