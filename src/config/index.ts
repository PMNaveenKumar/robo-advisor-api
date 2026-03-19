import "dotenv/config";
import path from "path";

const appConfig = {
  server: {
    port:         parseInt(process.env.PORT         ?? "3000", 10),
    httpsPort:    parseInt(process.env.HTTPS_PORT   ?? "3443", 10),
    nodeEnv:      process.env.NODE_ENV              ?? "development",
    isProduction: process.env.NODE_ENV === "production",
  },
  jwt: {
    secret:    process.env.JWT_SECRET    ?? "fallback-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  },
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim()),
  },
  business: {
    defaultStockPrice:   parseFloat(process.env.DEFAULT_STOCK_PRICE   ?? "100"),
    shareDecimalPlaces:  parseInt(process.env.SHARE_DECIMAL_PLACES    ?? "3", 10),
    amountDecimalPlaces: parseInt(process.env.AMOUNT_DECIMAL_PLACES   ?? "3", 10),
  },
  market: {
    openHour:    parseInt(process.env.MARKET_OPEN_HOUR    ?? "9",  10),
    openMinute:  parseInt(process.env.MARKET_OPEN_MINUTE  ?? "30", 10),
    closeHour:   parseInt(process.env.MARKET_CLOSE_HOUR   ?? "16", 10),
    closeMinute: parseInt(process.env.MARKET_CLOSE_MINUTE ?? "0",  10),
  },
  rateLimit: {
    windowMs:    parseInt(process.env.RATE_LIMIT_WINDOW_MS      ?? "900000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS   ?? "10",     10),
  },
  ssl: {
    keyPath:  path.join(process.cwd(), "certs", "server.key"),
    certPath: path.join(process.cwd(), "certs", "server.cert"),
  },
};

export type AppConfig = typeof appConfig;
export default appConfig;
