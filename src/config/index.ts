import "dotenv/config";
import path from "path";
import fs from "fs";

const appConfig = {
  server: {
    port: parseInt(process.env.PORT ?? "3000", 10),
    httpsPort: parseInt(process.env.HTTPS_PORT ?? "3443", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    isProduction: process.env.NODE_ENV === "production",
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "fallback-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  },
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim()),
  },
  business: {
    defaultStockPrice: parseFloat(process.env.DEFAULT_STOCK_PRICE ?? "100"),
    shareDecimalPlaces: parseInt(process.env.SHARE_DECIMAL_PLACES ?? "3", 10),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000", 10), // 15 min
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "10", 10),
  },
  ssl: {
    // process.cwd() always resolves to the project root where npm run dev is executed.
    // __dirname would point to src/config/ which is wrong at runtime with ts-node.
    keyPath: path.join(process.cwd(), "certs", "server.key"),
    certPath: path.join(process.cwd(), "certs", "server.cert"),
  },
};

// Write config snapshot to project root (outside src/ to avoid nodemon loop)
const configCachePath = path.join(__dirname, "..", "..", "config.json");
try {
  fs.writeFileSync(configCachePath, JSON.stringify(appConfig, null, 2));
} catch {
  // Non-fatal — skip if path is not writable (e.g. CI environments)
}

export type AppConfig = typeof appConfig;
export default appConfig;
