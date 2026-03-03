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
  alpacaDataFeed: (process.env.ALPACA_DATA_FEED ?? "sip") as "iex" | "sip",
  alpacaWsUrl: `wss://stream.data.alpaca.markets/v2/${process.env.ALPACA_DATA_FEED ?? "sip"}`,
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
