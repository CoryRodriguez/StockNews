import { Router } from 'express';
import OpenAI from 'openai';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { config as appConfig } from '../config';

const router = Router();

// ── Valid categories (mirrors catalystClassifier.ts) ─────────────────────────

const VALID_CATEGORIES = [
  'MA_ACQUISITION', 'TENDER_OFFER', 'MERGER', 'GOING_PRIVATE',
  'FDA_APPROVAL', 'FDA_BREAKTHROUGH', 'CLINICAL_TRIAL_SUCCESS',
  'EARNINGS_BEAT', 'REVENUE_RECORD', 'GUIDANCE_RAISE',
  'GOVERNMENT_CONTRACT', 'CONTRACT_AWARD', 'ANALYST_UPGRADE',
  'PARTNERSHIP', 'PRODUCT_LAUNCH', 'STOCK_BUYBACK', 'OTHER',
] as const;

// ── OpenAI client (lazy init — same pattern as signalEngine.ts) ──────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!appConfig.openaiApiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: appConfig.openaiApiKey,
      timeout: 5000,
    });
  }
  return openaiClient;
}

// ─── GET /stats ──────────────────────────────────────────────────────────────
// Returns labeling progress: total signals, labeled count, %, category breakdown
router.get('/stats', requireAuth, async (_req, res) => {
  try {
    const [totalSignals, labeledCount, categoryBreakdown] = await Promise.all([
      prisma.botSignalLog.count(),
      prisma.headlineLabel.count(),
      prisma.headlineLabel.groupBy({
        by: ['overrideCategory'],
        _count: { id: true },
        where: { overrideCategory: { not: null } },
      }),
    ]);

    res.json({
      totalSignals,
      labeledCount,
      labeledPct: totalSignals > 0 ? Math.round((labeledCount / totalSignals) * 100) : 0,
      categoryBreakdown: categoryBreakdown.map((r) => ({
        category: r.overrideCategory,
        count: r._count.id,
      })),
    });
  } catch (err) {
    console.error('[Labels] /stats error:', err);
    res.status(500).json({ error: 'Failed to load label stats' });
  }
});

// ─── PUT /:signalId ──────────────────────────────────────────────────────────
// Upsert a HeadlineLabel for the given signal
router.put('/:signalId', requireAuth, async (req, res) => {
  try {
    const { signalId } = req.params;
    const { overrideCategory, overrideTier, notes } = req.body as {
      overrideCategory?: string;
      overrideTier?: number;
      notes?: string;
    };

    // Validate category if provided
    if (overrideCategory && !VALID_CATEGORIES.includes(overrideCategory as any)) {
      res.status(400).json({ error: `Invalid category: ${overrideCategory}` });
      return;
    }
    // Validate tier if provided
    if (overrideTier !== undefined && (overrideTier < 1 || overrideTier > 5)) {
      res.status(400).json({ error: 'Tier must be 1-5' });
      return;
    }

    // Verify signal exists
    const signal = await prisma.botSignalLog.findUnique({ where: { id: signalId } });
    if (!signal) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }

    const label = await prisma.headlineLabel.upsert({
      where: { signalId },
      create: { signalId, overrideCategory, overrideTier, notes },
      update: { overrideCategory, overrideTier, notes },
    });

    res.json(label);
  } catch (err) {
    console.error('[Labels] PUT error:', err);
    res.status(500).json({ error: 'Failed to save label' });
  }
});

// ─── DELETE /:signalId ───────────────────────────────────────────────────────
// Remove a label
router.delete('/:signalId', requireAuth, async (req, res) => {
  try {
    const { signalId } = req.params;
    await prisma.headlineLabel.delete({ where: { signalId } }).catch(() => null);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Labels] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

// ─── POST /:signalId/reclassify ─────────────────────────────────────────────
// Call GPT-4o-mini to classify the headline, store result in the label row
router.post('/:signalId/reclassify', requireAuth, async (req, res) => {
  try {
    const { signalId } = req.params;

    const signal = await prisma.botSignalLog.findUnique({ where: { id: signalId } });
    if (!signal) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }

    const client = getOpenAIClient();
    if (!client) {
      res.status(503).json({ error: 'OpenAI API key not configured' });
      return;
    }

    const categoriesList = VALID_CATEGORIES.join(', ');
    const response = await client.chat.completions.create({
      model: appConfig.openaiSignalModel,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `You are a stock news catalyst classifier. Given a headline and symbol, classify it into exactly one category and assign a tier (1-4, where 1=highest impact).
Valid categories: ${categoriesList}
Respond with JSON only: {"category": "...", "tier": 1-4, "reasoning": "one sentence"}`,
        },
        {
          role: 'user',
          content: `Symbol: ${signal.symbol}\nHeadline: ${signal.headline}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    let parsed: { category: string; tier: number; reasoning: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: 'AI returned invalid JSON', raw: text });
      return;
    }

    // Save AI result into the label (upsert so it creates if needed)
    const label = await prisma.headlineLabel.upsert({
      where: { signalId },
      create: {
        signalId,
        aiReclassCategory: parsed.category,
        aiReclassTier: parsed.tier,
        aiReclassReason: parsed.reasoning,
      },
      update: {
        aiReclassCategory: parsed.category,
        aiReclassTier: parsed.tier,
        aiReclassReason: parsed.reasoning,
      },
    });

    res.json(label);
  } catch (err) {
    console.error('[Labels] /reclassify error:', err);
    res.status(500).json({ error: 'Failed to reclassify' });
  }
});

export default router;
