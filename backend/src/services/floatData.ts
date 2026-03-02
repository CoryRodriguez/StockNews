/**
 * Financial Modeling Prep (FMP) enrichment service
 * Fetches float, shares outstanding, market cap, sector from FMP batch profile endpoint.
 * Results cached per-ticker for 24 hours.
 */
import { config } from "../config";

export interface FloatData {
  float: number | null;         // shares outstanding (FMP profile doesn't have true float)
  shortInterest: number | null; // not available on free tier — reserved
  marketCap: number | null;
  sector: string | null;
  ts: number;
}

const cache = new Map<string, FloatData>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const FMP_BASE = "https://financialmodelingprep.com/stable";

/**
 * Enrich a list of tickers with float/market data from FMP.
 * Returns a map of ticker → FloatData (cache-first, batch-fetches misses).
 */
export async function enrichWithFloat(
  tickers: string[]
): Promise<Map<string, FloatData>> {
  const result = new Map<string, FloatData>();
  const misses: string[] = [];
  const now = Date.now();

  for (const t of tickers) {
    const cached = cache.get(t);
    if (cached && now - cached.ts < CACHE_TTL) {
      result.set(t, cached);
    } else {
      misses.push(t);
    }
  }

  if (misses.length > 0 && config.fmpApiKey) {
    // FMP batch profile supports up to ~50 symbols comma-separated
    for (let i = 0; i < misses.length; i += 50) {
      const batch = misses.slice(i, i + 50);
      try {
        const url = `${FMP_BASE}/profile?symbol=${batch.join(",")}&apikey=${config.fmpApiKey}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          console.warn(`[FloatData] FMP profile returned ${resp.status}`);
          continue;
        }
        const profiles = (await resp.json()) as FmpProfile[];
        for (const p of profiles) {
          const data: FloatData = {
            float: null,
            shortInterest: null,
            marketCap: p.marketCap ?? null,
            sector: p.sector ?? null,
            ts: now,
          };
          cache.set(p.symbol, data);
          result.set(p.symbol, data);
        }
      } catch (err) {
        console.warn("[FloatData] FMP fetch error:", err);
      }
    }
  }

  // Fill remaining misses with empty data
  for (const t of misses) {
    if (!result.has(t)) {
      result.set(t, { float: null, shortInterest: null, marketCap: null, sector: null, ts: now });
    }
  }

  return result;
}

interface FmpProfile {
  symbol: string;
  marketCap?: number;
  sector?: string;
  industry?: string;
}
