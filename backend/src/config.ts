import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";

// JWT_SECRET is REQUIRED in production. In development, generate a random
// ephemeral secret so tokens don't persist across restarts (secure by default).
function resolveJwtSecret(): string {
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 32) return env;
  if (nodeEnv === "production") {
    console.error(
      "[FATAL] JWT_SECRET must be set and at least 32 characters in production"
    );
    process.exit(1);
  }
  if (env) {
    console.warn(
      "[WARN] JWT_SECRET is too short (< 32 chars). Using random ephemeral secret."
    );
  }
  return crypto.randomBytes(32).toString("hex");
}

// Allowed CORS origins — configurable via env, defaults to localhost in dev
function resolveCorsOrigins(): string[] {
  const env = process.env.CORS_ORIGINS;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  if (nodeEnv === "production") return []; // must be explicitly set
  return ["http://localhost:5173", "http://localhost:3000"];
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001"),
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigins: resolveCorsOrigins(),
  rtprApiKey: process.env.RTPR_API_KEY ?? "",
  benzingaApiKey: process.env.BENZINGA_API_KEY ?? "",
  alpacaApiKey: process.env.ALPACA_API_KEY ?? "",
  alpacaApiSecret: process.env.ALPACA_API_SECRET ?? "",
  nodeEnv,
  alpacaDataUrl: "https://data.alpaca.markets",
  alpacaDataFeed: (process.env.ALPACA_DATA_FEED ?? "iex") as "iex" | "sip",
  alpacaWsUrl: `wss://stream.data.alpaca.markets/v2/${process.env.ALPACA_DATA_FEED ?? "iex"}`,
  rtprWsUrl: "wss://ws.rtpr.io",
  // Paper trading
  paperTradingEnabled: process.env.PAPER_TRADING_ENABLED === "true",
  alpacaPaperUrl: "https://paper-api.alpaca.markets",
  alpacaLiveUrl: "https://api.alpaca.markets",
  // OpenAI integration
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiSignalModel: "gpt-4o-mini",
  paperTradeQty: parseInt(process.env.PAPER_TRADE_QTY ?? "10"),
  paperTradeSellDelaySec: parseInt(process.env.PAPER_TRADE_SELL_DELAY_SEC ?? "60"),
  paperTradeCooldownMin: parseInt(process.env.PAPER_TRADE_COOLDOWN_MIN ?? "5"),
  // Financial Modeling Prep
  fmpApiKey: process.env.FMP_API_KEY ?? "",
} as const;
