import { useEffect } from "react";
import { useNewsStore } from "../store/newsStore";
import { useScannerStore } from "../store/scannerStore";
import { useWatchlistStore } from "../store/watchlistStore";
import { useTradesStore } from "../store/tradesStore";
import { NewsArticle, ScannerAlert, PaperTrade } from "../types";
import { deriveStars } from "../utils/newsUtils";

function ts(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

const DUMMY_NEWS: NewsArticle[] = [
  {
    ticker: "AAPL",
    title: "Apple acquires AI startup Nexus AI in $4.2B deal, expanding on-device intelligence",
    body: "Apple has completed the acquisition of Nexus AI, a San Francisco-based startup specializing in on-device large language models. The takeover is expected to close by Q3 and will integrate Nexus's technology into the next iPhone generation.",
    author: "Reuters",
    source: "benzinga",
    createdAt: ts(1),
    receivedAt: ts(1),
    stars: 5,
  },
  {
    ticker: "MRNA",
    title: "Moderna receives FDA approval for mRNA flu vaccine, Phase 3 trial showed 94% efficacy",
    body: "The FDA approved Moderna's next-generation influenza vaccine mRNA-1010 following Phase 3 clinical trial results. The BLA submission was accepted under fast track designation. PDUFA date was today.",
    author: "RTPR",
    source: "rtpr",
    createdAt: ts(3),
    receivedAt: ts(3),
    stars: 4,
  },
  {
    ticker: "NVDA",
    title: "NVIDIA beats Q4 earnings estimates; revenue $22.1B vs $21.0B expected, raises guidance",
    body: "NVIDIA reported record quarterly revenue of $22.1B, beating analyst consensus of $21.0B. EPS of $5.16 beat estimates of $4.91. Data center segment surged 409% YoY. Management raised full-year guidance to $88B.",
    author: "Bloomberg",
    source: "benzinga",
    createdAt: ts(6),
    receivedAt: ts(6),
    stars: 3,
  },
  {
    ticker: "PLTR",
    title: "Palantir awarded $480M DoD government contract for AI battlefield analytics platform",
    body: "Palantir Technologies announced a $480M federal contract with the Department of Defense to deploy its AI-enabled analytics platform across multiple combat commands. The defense contract is a 3-year deal with two optional extensions.",
    author: "RTPR",
    source: "rtpr",
    createdAt: ts(10),
    receivedAt: ts(10),
    stars: 2,
  },
  {
    ticker: "GME",
    title: "GameStop reports quarterly revenue miss; comparable store sales down 14% YoY",
    body: "GameStop reported Q3 revenue of $1.02B, missing the $1.18B consensus estimate. Net income declined 28% as digital shift continues to pressure physical game sales. Guidance was not raised.",
    author: "SeekingAlpha",
    source: "benzinga",
    createdAt: ts(14),
    receivedAt: ts(14),
    stars: 3,
  },
  {
    ticker: "TSLA",
    title: "Tesla merger talks with Rivian denied by both companies following report",
    body: "Representatives for Tesla and Rivian both denied reports that acquisition discussions had taken place. A note from a Wedbush analyst claimed the two EV makers explored a merger earlier this year.",
    author: "RTPR",
    source: "rtpr",
    createdAt: ts(18),
    receivedAt: ts(18),
    stars: 5,
  },
  {
    ticker: "AMZN",
    title: "Amazon raises AWS pricing for enterprise cloud contracts by 8% effective March 1",
    body: "Amazon Web Services notified enterprise customers of an 8% price increase on reserved instance contracts and committed use discounts. The increase applies to compute and storage services.",
    author: "TechCrunch",
    source: "benzinga",
    createdAt: ts(22),
    receivedAt: ts(22),
    stars: 1,
  },
  {
    ticker: "BIIB",
    title: "Biogen Phase 3 clinical trial for Alzheimer's drug shows 27% reduction in cognitive decline",
    body: "Biogen released Phase III trial data for lecanemab showing statistically significant 27% slowing of cognitive decline vs placebo. NDA filing expected in Q2. FDA fast track designation already granted.",
    author: "RTPR",
    source: "rtpr",
    createdAt: ts(28),
    receivedAt: ts(28),
    stars: 4,
  },
  {
    ticker: "META",
    title: "Meta profit surges 168% YoY on ad revenue recovery; Q4 EPS $5.33 beat $4.86 estimate",
    body: "Meta Platforms reported net income of $14.0B in Q4, a 168% increase year-over-year. EPS of $5.33 crushed the $4.86 consensus. Revenue grew 25% to $40.1B driven by Reels monetization and AI-powered ad targeting.",
    author: "Bloomberg",
    source: "benzinga",
    createdAt: ts(35),
    receivedAt: ts(35),
    stars: 3,
  },
  {
    ticker: "BA",
    title: "Boeing secures $18B government contract with USAF for next-generation tanker aircraft",
    body: "Boeing announced an $18B federal contract with the US Air Force for 100 KC-46A Pegasus tanker aircraft. The defense contract includes full sustainment and a 15-year maintenance agreement with the Department of Defense.",
    author: "DefenseNews",
    source: "benzinga",
    createdAt: ts(42),
    receivedAt: ts(42),
    stars: 2,
  },
];

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

/** Seeds all stores with dummy data for UI testing.
 *  Only seeds if the stores are empty (no real data yet). */
export function useDummyData() {
  useEffect(() => {
    // News
    const newsState = useNewsStore.getState();
    if (newsState.articles.length === 0) {
      const articlesWithStars = DUMMY_NEWS.map((a) => ({
        ...a,
        stars: a.stars ?? deriveStars(a.title),
      }));
      // Add in reverse order so newest ends up at top
      for (const article of [...articlesWithStars].reverse()) {
        newsState.addArticle(article);
      }
    }

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
