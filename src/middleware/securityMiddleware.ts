import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import config from "../config";
import { AppError } from "../errors/AppError";
import { logger } from "./loggerMiddleware";

// ─── 1. Rate Limiter ──────────────────────────────────────────────────────────

/**
 * loginRateLimiter
 * Applied only to POST /api/auth/login.
 * Limits each IP to RATE_LIMIT_MAX_REQUESTS attempts per RATE_LIMIT_WINDOW_MS.
 * Prevents brute-force password attacks.
 *
 * Configured via .env:
 *   RATE_LIMIT_WINDOW_MS=900000   (15 minutes)
 *   RATE_LIMIT_MAX_REQUESTS=10    (10 attempts per window)
 */
export const loginRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,  // returns RateLimit-* headers in response
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
    statusCode: 429,
  },
  handler: (req: Request, res: Response) => {
    logger.warn(
      `Rate limit exceeded for login — IP: ${req.ip}`
    );
    res.status(429).json({
      success: false,
      message: "Too many login attempts. Please try again later.",
      statusCode: 429,
    });
  },
});

// ─── 2. Request ID Middleware ─────────────────────────────────────────────────

/**
 * requestIdMiddleware
 * Generates a unique X-Request-ID header for every incoming request.
 * If the client already sends an X-Request-ID, it is reused (trusted upstream proxy).
 * The ID is attached to req object and echoed back in the response header
 * for distributed tracing across services.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId: string =
    (req.headers["x-request-id"] as string) || uuidv4();

  // Attach to request so it's available in controllers/services if needed
  req.headers["x-request-id"] = requestId;

  // Echo back in response so clients can correlate logs
  res.setHeader("X-Request-ID", requestId);

  next();
}

// ─── 3. HTTPS Enforcer ────────────────────────────────────────────────────────

/**
 * httpsEnforcer
 * In production, rejects plain HTTP requests with 301 redirect to HTTPS.
 * Skipped entirely in development so local testing works without certs.
 *
 * Detection order:
 *   1. X-Forwarded-Proto header (set by load balancers / reverse proxies)
 *   2. req.secure (set by Node.js HTTPS server directly)
 */
export function httpsEnforcer(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.server.isProduction) {
    return next(); // skip in development
  }

  const proto = req.headers["x-forwarded-proto"] as string | undefined;
  const isHttps = proto === "https" || req.secure;

  if (!isHttps) {
    const httpsUrl = `https://${req.hostname}:${config.server.httpsPort}${req.originalUrl}`;
    logger.warn(`Plain HTTP request rejected — redirecting to: ${httpsUrl}`);
    res.redirect(301, httpsUrl);
    return;
  }

  next();
}
