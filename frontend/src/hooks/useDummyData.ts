import { useEffect } from "react";
import { useScannerStore } from "../store/scannerStore";
import { useWatchlistStore } from "../store/watchlistStore";
import { useTradesStore } from "../store/tradesStore";
import { ScannerAlert, PaperTrade } from "../types";

function ts(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}


function makeAlert(
  scannerId: string,
  ticker: string,
  price: number,
  changePct: number,
  float: number,
  relativeVolume: number,
  hasNews: boolean,
  minsAgo: number
): ScannerAlert {
  const high = price * (1 + Math.abs(changePct) / 100 + 0.01);
  const low = price * (1 - 0.02);
  return {
    scannerId,
    ticker,
    price,
    changePct,
    gapPct: changePct * 0.6,
    volume: Math.round(float * relativeVolume * 0.15),
    relativeVolume,
    float,
    high,
    low,
    hasNews,
    alertedAt: ts(minsAgo),
  };
}

const DUMMY_SCANNER: ScannerAlert[] = [
  // news_flow
  makeAlert("news_flow", "MRNA",  142.50,  18.4, 395_000_000, 8.2,  true,  3),
  makeAlert("news_flow", "AAPL",  192.30,  4.1,  15_400_000_000, 3.1, true, 1),
  makeAlert("news_flow", "BIIB",  305.20,  12.7, 144_000_000, 6.8,  true,  28),
  makeAlert("news_flow", "PLTR",  22.75,   7.5,  2_100_000_000, 4.4, true,  10),
  makeAlert("news_flow", "TSLA",  248.90,  3.2,  3_200_000_000, 2.9, true,  18),

  // gap_up
  makeAlert("gap_up", "IONQ",    14.82,  38.5,  182_000_000, 12.4, false,  5),
  makeAlert("gap_up", "SOUN",     5.41,  27.3,  268_000_000, 9.7,  true,   8),
  makeAlert("gap_up", "CLOV",     2.18,  22.1,  312_000_000, 7.1,  false, 12),
  makeAlert("gap_up", "PRTY",     1.95,  19.4,  89_000_000,  6.5,  false, 15),
  makeAlert("gap_up", "BBAI",     3.47,  16.8,  142_000_000, 5.3,  true,  20),
  makeAlert("gap_up", "SPCE",     2.73,  14.2,  225_000_000, 4.8,  false, 25),

  // momentum
  makeAlert("momentum", "NVDA",  874.20,  9.8,  2_460_000_000, 5.2, true,   6),
  makeAlert("momentum", "AMD",   175.40,  7.3,  1_615_000_000, 4.1, false,  9),
  makeAlert("momentum", "SMCI",  1042.0,  14.1, 54_000_000,    7.6, true,  11),
  makeAlert("momentum", "MARA",   24.80,  11.2, 188_000_000,   6.3, false, 16),
  makeAlert("momentum", "RIOT",   18.35,  8.9,  176_000_000,   5.8, false, 21),
];

const DUMMY_TRADES: PaperTrade[] = [
  {
    id: "dummy-1",
    ticker: "MRNA",
    qty: 100,
    buyOrderId: "ord-001",
    buyPrice: 128.50,
    buyStatus: "filled",
    sellOrderId: "ord-002",
    sellPrice: 142.50,
    sellStatus: "filled",
    catalyst: "Moderna receives FDA approval for mRNA flu vaccine",
    catalystType: "tier2",
    scannerId: "news_flow",
    pnl: 1400.00,
    createdAt: ts(35),
    updatedAt: ts(3),
  },
  {
    id: "dummy-2",
    ticker: "NVDA",
    qty: 50,
    buyOrderId: "ord-003",
    buyPrice: 840.00,
    buyStatus: "filled",
    sellOrderId: null,
    sellPrice: null,
    sellStatus: "awaiting",
    catalyst: "NVIDIA beats Q4 earnings estimates; revenue $22.1B",
    catalystType: "tier3",
    scannerId: "momentum",
    pnl: null,
    createdAt: ts(20),
    updatedAt: ts(6),
  },
  {
    id: "dummy-3",
    ticker: "PLTR",
    qty: 200,
    buyOrderId: "ord-004",
    buyPrice: 21.10,
    buyStatus: "filled",
    sellOrderId: "ord-005",
    sellPrice: 22.75,
    sellStatus: "filled",
    catalyst: "Palantir awarded $480M DoD government contract",
    catalystType: "tier4",
    scannerId: "news_flow",
    pnl: 330.00,
    createdAt: ts(45),
    updatedAt: ts(10),
  },
  {
    id: "dummy-4",
    ticker: "AAPL",
    qty: 75,
    buyOrderId: "ord-006",
    buyPrice: 188.00,
    buyStatus: "filled",
    sellOrderId: null,
    sellPrice: null,
    sellStatus: "awaiting",
    catalyst: "Apple acquires AI startup Nexus AI in $4.2B deal",
    catalystType: "tier1",
    scannerId: "news_flow",
    pnl: null,
    createdAt: ts(8),
    updatedAt: ts(1),
  },
];

const DUMMY_WATCHLIST_ID = "dummy-watchlist-1";

const DUMMY_TICKERS = ["AAPL", "NVDA", "TSLA", "MRNA", "PLTR", "BIIB", "META", "AMD"];

const DUMMY_PRICES: Record<string, { price: number; prevClose: number; relativeVolume: number; float: number }> = {
  AAPL:  { price: 192.30, prevClose: 184.60, relativeVolume: 3.1, float: 15_440_000_000 },
  NVDA:  { price: 874.20, prevClose: 796.10, relativeVolume: 5.2, float: 2_462_000_000 },
  TSLA:  { price: 248.90, prevClose: 241.15, relativeVolume: 2.9, float: 3_190_000_000 },
  MRNA:  { price: 142.50, prevClose: 120.40, relativeVolume: 8.2, float: 395_000_000 },
  PLTR:  { price: 22.75,  prevClose: 21.10,  relativeVolume: 4.4, float: 2_100_000_000 },
  BIIB:  { price: 305.20, prevClose: 270.50, relativeVolume: 6.8, float: 144_000_000 },
  META:  { price: 498.60, prevClose: 463.10, relativeVolume: 3.5, float: 2_570_000_000 },
  AMD:   { price: 175.40, prevClose: 163.50, relativeVolume: 4.1, float: 1_615_000_000 },
};

/** Seeds scanner, watchlist, and trades stores with dummy data for UI testing.
 *  Only seeds if the stores are empty (no real data yet). */
export function useDummyData() {
  useEffect(() => {
    // Scanner alerts
    const scannerState = useScannerStore.getState();
    const allEmpty = DUMMY_SCANNER.every(
      (a) => (scannerState.alerts[a.scannerId] ?? []).length === 0
    );
    if (allEmpty) {
      for (const alert of DUMMY_SCANNER) {
        scannerState.addAlert(alert);
      }
    }

    // Watchlist — seed a dummy list if none exist
    const wlState = useWatchlistStore.getState();
    if (wlState.lists.length === 0) {
      wlState.setLists([
        { id: DUMMY_WATCHLIST_ID, name: "My Watchlist", tickers: DUMMY_TICKERS },
      ]);
    }
    // Always seed price snapshots so watchlist shows data
    for (const [ticker, data] of Object.entries(DUMMY_PRICES)) {
      const changeDollar = data.price - data.prevClose;
      const changePct = (changeDollar / data.prevClose) * 100;
      useWatchlistStore.getState().setSnapshot({
        ticker,
        price: data.price,
        prevClose: data.prevClose,
        changeDollar,
        changePct,
        volume: Math.round(data.float * data.relativeVolume * 0.05),
        high: data.price * 1.02,
        low: data.prevClose * 0.99,
        relativeVolume: data.relativeVolume,
        float: data.float,
      });
    }

    // Trades
    const tradesState = useTradesStore.getState();
    if (tradesState.trades.length === 0) {
      useTradesStore.getState().setTrades(DUMMY_TRADES);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
