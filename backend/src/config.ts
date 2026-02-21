import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? "3001"),
  jwtSecret: process.env.JWT_SECRET ?? "dev_secret_change_me",
  rtprApiKey: process.env.RTPR_API_KEY ?? "",
  alpacaApiKey: process.env.ALPACA_API_KEY ?? "",
  alpacaApiSecret: process.env.ALPACA_API_SECRET ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  alpacaDataUrl: "https://data.alpaca.markets",
  alpacaWsUrl: "wss://stream.data.alpaca.markets/v2/iex",
  rtprWsUrl: "wss://ws.rtpr.io",
} as const;
