import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger";

// Single shared Logger instance used across the entire application
export const logger = new Logger();

/**
 * loggerMiddleware
 * Logs every HTTP request: method, URL, status, duration, and X-Request-ID.
 * Runs after requestIdMiddleware so req.requestId is already populated.
 *
 * Output goes to:
 *   console          (always)
 *   logs/access-YYYY-MM-DD.log   (INFO requests)
 *   logs/error-YYYY-MM-DD.log    (ERROR only)
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime: number = Date.now();

  res.on("finish", () => {
    const durationMs: number = Date.now() - startTime;
    const isError = res.statusCode >= 400;

    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs,
      requestId: req.requestId,
      ip: req.ip,
    };

    const message = `${req.method} ${req.originalUrl} → ${res.statusCode} | ${durationMs}ms`;

    if (isError) {
      logger.error(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
}
