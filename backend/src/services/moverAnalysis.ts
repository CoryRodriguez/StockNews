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
import { getMostActives, getSnapshots } from "./alpaca";
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

export async function analyzeTopMovers(dateET?: string): Promise<void> {
  const date = dateET ?? getTodayDateET();
  console.log(`[MoverAnalysis] Starting analysis for ${date}`);

  const client = getOpenAIClient();
  if (!client) {
    console.warn("[MoverAnalysis] No OpenAI API key, skipping");
    return;
  }

  // 1. Get most active symbols
  let symbols: string[];
  try {
    symbols = await getMostActives();
  } catch (err) {
    console.error("[MoverAnalysis] Failed to get most actives:", err instanceof Error ? err.message : err);
    return;
  }

  if (symbols.length === 0) {
    console.warn("[MoverAnalysis] No most actives returned");
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
          content: `You are a stock market analyst. Analyze today's top movers and identify trending themes/keywords.

Return JSON:
{
  "trendingKeywords": [
    { "keyword": "<theme or keyword>", "count": <number of tickers related>, "avgChangePct": <average % change>, "tickers": ["SYM1", "SYM2"] }
  ],
  "summary": "<2-4 paragraph narrative analyzing today's top movers, themes, and market sentiment>"
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

    // 5. Upsert DailyMoverAnalysis row
    await prisma.dailyMoverAnalysis.upsert({
      where: { date },
      create: {
        date,
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
      moversJson,
      trendingKeywords: result.trendingKeywords ?? [],
      aiSummary: result.summary ?? "",
    });

    console.log(`[MoverAnalysis] Analysis complete for ${date} — ${sorted.length} movers, ${result.trendingKeywords?.length ?? 0} trending keywords`);
  } catch (err) {
    console.error("[MoverAnalysis] GPT analysis error:", err instanceof Error ? err.message : err);
  }
}

// ── Cron scheduler ────────────────────────────────────────────────────────

export function scheduleMoverCron(): void {
  // 4:05 PM ET, weekdays only
  cron.schedule("5 16 * * 1-5", () => {
    console.log("[MoverAnalysis] EOD cron triggered");
    analyzeTopMovers().catch((err) =>
      console.error("[MoverAnalysis] Cron error:", err instanceof Error ? err.message : err)
    );
  }, { timezone: "America/New_York" });

  console.log("[MoverAnalysis] EOD cron scheduled (4:05 PM ET, weekdays)");
}
