import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger";

export const logger = new Logger();

/**
 * loggerMiddleware
 * Logs every HTTP request with method, URL, status, duration, and X-Request-ID.
 *
 * Severity rules:
 *   5xx → ERROR  (server faults — need immediate attention)
 *   4xx → WARN   (client errors — expected, should not fire alerts)
 *   2xx/3xx → INFO
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime: number = Date.now();

  res.on("finish", () => {
    const durationMs: number = Date.now() - startTime;
    const status = res.statusCode;

    const meta = {
      method: req.method,
      url: req.originalUrl,
      status,
      durationMs,
      requestId: req.requestId,
      ip: req.ip,
    };

    const message = `${req.method} ${req.originalUrl} → ${status} | ${durationMs}ms`;

    if (status >= 500) {
      logger.error(message, meta);     // server fault
    } else if (status >= 400) {
      logger.warn(message, meta);      // client error — WARN, not ERROR
    } else {
      logger.info(message, meta);
    }
  });

  next();
}
