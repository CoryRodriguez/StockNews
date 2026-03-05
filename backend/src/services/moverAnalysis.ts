/**
 * Mover Analysis Service
 *
 * EOD cron at 4:05 PM ET analyzes top 10 movers via GPT,
 * extracts trending keywords, and stores as DailyMoverAnalysis.
 */
import cron from "node-cron";
import OpenAI from "openai";
import prisma from "../db/client";
import { config } from "../config";
import { getMostActives, getTopMovers, getSnapshots } from "./alpaca";
import { broadcast } from "../ws/clientHub";

// ── OpenAI client (lazy init) ─────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey, timeout: 30_000 });
  }
  return openaiClient;
}

function getTodayDateET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// ── Main analysis function ────────────────────────────────────────────────

export type MoverSession = "premarket" | "market" | "postmarket";

export async function analyzeTopMovers(dateET?: string, session: MoverSession = "market"): Promise<void> {
  const date = dateET ?? getTodayDateET();
  console.log(`[MoverAnalysis] Starting ${session} analysis for ${date}`);

  const client = getOpenAIClient();
  if (!client) {
    console.warn("[MoverAnalysis] No OpenAI API key, skipping");
    return;
  }

  // 1. Get symbols from both screeners and merge for better coverage
  let symbols: string[];
  try {
    const [actives, movers] = await Promise.all([
      getMostActives().catch(() => [] as string[]),
      getTopMovers().catch(() => [] as string[]),
    ]);
    symbols = [...new Set([...actives, ...movers])];
  } catch (err) {
    console.error("[MoverAnalysis] Failed to get symbols:", err instanceof Error ? err.message : err);
    return;
  }

  if (symbols.length === 0) {
    console.warn("[MoverAnalysis] No symbols returned from screeners");
    return;
  }

  // 2. Get snapshots and sort by absolute change
  const snaps = await getSnapshots(symbols.slice(0, 100));
  const sorted = snaps
    .filter((s) => s.price > 0 && s.prevClose > 0)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 10);

  if (sorted.length === 0) {
    console.warn("[MoverAnalysis] No valid snapshots for analysis");
    return;
  }

  const moversJson = sorted.map((s) => ({
    ticker: s.ticker,
    changePct: Math.round(s.changePct * 100) / 100,
    volume: s.volume,
    relVol: Math.round(s.relativeVolume * 100) / 100,
    priceOpen: s.open,
    priceClose: s.price,
  }));

  // 3. Query today's keyword hits for these tickers
  const moverTickers = sorted.map((s) => s.ticker);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayHits = await prisma.keywordHit.findMany({
    where: {
      ticker: { in: moverTickers },
      createdAt: { gte: todayStart },
    },
    select: {
      ticker: true,
      headline: true,
      catalystCategory: true,
      matchedKeyword: true,
      aiStars: true,
    },
  });

  // 4. Send to GPT for analysis
  const moversDesc = moversJson
    .map((m) => `${m.ticker}: ${m.changePct > 0 ? "+" : ""}${m.changePct}% | Vol: ${m.volume.toLocaleString()} | RelVol: ${m.relVol}x`)
    .join("\n");

  const newsDesc = todayHits.length > 0
    ? todayHits.map((h) => `${h.ticker}: [${h.catalystCategory ?? "N/A"}] ${h.headline.slice(0, 100)}`).join("\n")
    : "No keyword hits for these tickers today.";

  try {
    const response = await client.chat.completions.create({
      model: config.openaiSignalModel,
      temperature: 0.4,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a stock market analyst. Analyze the top movers for the ${session === "premarket" ? "pre-market" : session === "postmarket" ? "after-hours" : "regular market"} session and identify trending themes/keywords.

Return JSON:
{
  "trendingKeywords": [
    { "keyword": "<theme or keyword>", "count": <number of tickers related>, "avgChangePct": <average % change>, "tickers": ["SYM1", "SYM2"] }
  ],
  "summary": "<2-4 paragraph narrative analyzing the top movers, themes, and market sentiment>"
}`,
        },
        {
          role: "user",
          content: `Date: ${date}\n\nTop 10 Movers:\n${moversDesc}\n\nRelated News Headlines:\n${newsDesc}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      console.error("[MoverAnalysis] Empty GPT response");
      return;
    }

    const result = JSON.parse(text) as {
      trendingKeywords: Array<{ keyword: string; count: number; avgChangePct: number; tickers: string[] }>;
      summary: string;
    };

    // 5. Upsert DailyMoverAnalysis row (keyed on date + session)
    await prisma.dailyMoverAnalysis.upsert({
      where: { date_session: { date, session } },
      create: {
        date,
        session,
        moversJson,
        trendingKeywords: result.trendingKeywords ?? [],
        aiSummary: result.summary ?? "",
        computedAt: new Date(),
      },
      update: {
        moversJson,
        trendingKeywords: result.trendingKeywords ?? [],
        aiSummary: result.summary ?? "",
        computedAt: new Date(),
      },
    });

    // 6. Broadcast to frontend
    broadcast("catalyst", {
      type: "catalyst_mover_analysis",
      date,
      session,
      moversJson,
      trendingKeywords: result.trendingKeywords ?? [],
      aiSummary: result.summary ?? "",
    });

    console.log(`[MoverAnalysis] ${session} analysis complete for ${date} — ${sorted.length} movers, ${result.trendingKeywords?.length ?? 0} trending keywords`);
  } catch (err) {
    console.error("[MoverAnalysis] GPT analysis error:", err instanceof Error ? err.message : err);
  }
}

// ── Cron scheduler ────────────────────────────────────────────────────────

export function scheduleMoverCron(): void {
  // Pre-market: 9:15 AM ET, weekdays
  cron.schedule("15 9 * * 1-5", () => {
    console.log("[MoverAnalysis] Pre-market cron triggered");
    analyzeTopMovers(undefined, "premarket").catch((err) =>
      console.error("[MoverAnalysis] Pre-market cron error:", err instanceof Error ? err.message : err)
    );
  }, { timezone: "America/New_York" });

  // Regular market close: 4:05 PM ET, weekdays
  cron.schedule("5 16 * * 1-5", () => {
    console.log("[MoverAnalysis] Market close cron triggered");
    analyzeTopMovers(undefined, "market").catch((err) =>
      console.error("[MoverAnalysis] Market cron error:", err instanceof Error ? err.message : err)
    );
  }, { timezone: "America/New_York" });

  // Post-market: 6:00 PM ET, weekdays
  cron.schedule("0 18 * * 1-5", () => {
    console.log("[MoverAnalysis] Post-market cron triggered");
    analyzeTopMovers(undefined, "postmarket").catch((err) =>
      console.error("[MoverAnalysis] Post-market cron error:", err instanceof Error ? err.message : err)
    );
  }, { timezone: "America/New_York" });

  console.log("[MoverAnalysis] Crons scheduled: pre-market 9:15 AM, market 4:05 PM, post-market 6:00 PM ET (weekdays)");
}
