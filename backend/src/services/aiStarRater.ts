/**
 * AI Star Rater Service
 *
 * Evaluates news articles matching configured keywords via GPT-4o-mini
 * to produce AI-based star ratings (1-5), analysis text, and confidence.
 */
import OpenAI from "openai";
import { config } from "../config";
import { getBotConfig } from "./botController";
import { broadcast } from "../ws/clientHub";
import { recentArticles, type RtprArticle } from "./rtpr";
import prisma from "../db/client";

// ── OpenAI client (lazy init) ─────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey, timeout: 10_000 });
  }
  return openaiClient;
}

// ── Keyword helpers ───────────────────────────────────────────────────────

export function parseAiKeywords(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((k: unknown) => typeof k === "string" && k.length > 0);
  } catch { /* ignore */ }
  return [];
}

export function matchesKeywords(title: string, body: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const text = `${title} ${body}`.toLowerCase();
  return keywords.some((k) => text.includes(k.toLowerCase()));
}

// ── Main evaluation function ──────────────────────────────────────────────

export async function evaluateAiStars(article: RtprArticle, articleDbId: number): Promise<void> {
  const botConfig = getBotConfig();
  const keywords = parseAiKeywords(botConfig.aiKeywords);

  // No keywords configured or article doesn't match — skip
  if (!matchesKeywords(article.title, article.body, keywords)) return;

  const client = getOpenAIClient();
  if (!client) return; // No API key

  try {
    const response = await client.chat.completions.create({
      model: config.openaiSignalModel,
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a stock news analyst. Rate the significance of a news article as a potential stock price catalyst on a 1-5 scale.

5 = Major M&A, acquisition, merger, buyout, take-private
4 = FDA approval/clinical results, breakthrough therapy, major regulatory
3 = Earnings beat, raised guidance, record revenue, strong quarterly results
2 = Contract win, analyst upgrade, partnership, new product launch
1 = Minor/routine news, press release, conference attendance

Return JSON: {"stars": <1-5>, "analysis": "<2-3 sentence explanation>", "confidence": "<high|medium|low>"}`,
        },
        {
          role: "user",
          content: `Ticker: ${article.ticker}\nTitle: ${article.title}\nBody: ${article.body.slice(0, 1000)}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return;

    const result = JSON.parse(text) as { stars: number; analysis: string; confidence: string };
    const stars = Math.max(1, Math.min(5, Math.round(result.stars)));
    const analysis = String(result.analysis || "").slice(0, 2000);
    const confidence = ["high", "medium", "low"].includes(result.confidence) ? result.confidence : "medium";

    // Update DB row
    await prisma.newsArticle.update({
      where: { id: articleDbId },
      data: { aiStars: stars, aiAnalysis: analysis, aiConfidence: confidence },
    });

    // Update in-memory article
    article.aiStars = stars;
    article.aiAnalysis = analysis;
    article.aiConfidence = confidence;

    // Also update in recentArticles array (find by id)
    const memArticle = recentArticles.find((a) => a.id === articleDbId);
    if (memArticle && memArticle !== article) {
      memArticle.aiStars = stars;
      memArticle.aiAnalysis = analysis;
      memArticle.aiConfidence = confidence;
    }

    // Broadcast to frontend
    broadcast("news", {
      type: "news_article_ai_update",
      receivedAt: article.receivedAt,
      ticker: article.ticker,
      aiStars: stars,
      aiAnalysis: analysis,
      aiConfidence: confidence,
    });

    console.log(`[AiRater] ${article.ticker}: ${stars}★ (${confidence}) — ${analysis.slice(0, 60)}…`);
  } catch (err) {
    console.error("[AiRater] OpenAI error:", err instanceof Error ? err.message : err);
  }
}
