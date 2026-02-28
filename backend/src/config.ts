import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? "3001"),
  jwtSecret: process.env.JWT_SECRET ?? "dev_secret_change_me",
  rtprApiKey: process.env.RTPR_API_KEY ?? "",
  benzingaApiKey: process.env.BENZINGA_API_KEY ?? "",
  alpacaApiKey: process.env.ALPACA_API_KEY ?? "",
  alpacaApiSecret: process.env.ALPACA_API_SECRET ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  alpacaDataUrl: "https://data.alpaca.markets",
  alpacaWsUrl: "wss://stream.data.alpaca.markets/v2/iex",
  rtprWsUrl: "wss://ws.rtpr.io",
  // Paper trading
  paperTradingEnabled: process.env.PAPER_TRADING_ENABLED === "true",
  alpacaPaperUrl: "https://paper-api.alpaca.markets",
  alpacaLiveUrl: "https://api.alpaca.markets",
  // Anthropic Claude integration
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeSignalModel: "claude-haiku-4-5-20251022",
  paperTradeQty: parseInt(process.env.PAPER_TRADE_QTY ?? "10"),
  paperTradeSellDelaySec: parseInt(process.env.PAPER_TRADE_SELL_DELAY_SEC ?? "60"),
  paperTradeCooldownMin: parseInt(process.env.PAPER_TRADE_COOLDOWN_MIN ?? "5"),
} as const;
