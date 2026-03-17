import { Request, Response, NextFunction } from "express";
import { HttpError } from "routing-controllers";
import { AppError } from "../errors/AppError";
import { ApiErrorResponse } from "../types";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { logger } from "./loggerMiddleware";

/**
 * globalErrorHandler
 * Handles ALL errors with defaultErrorHandler: false in app.ts.
 *
 * Three types handled:
 *
 * 1. AppError (our own — thrown from services)
 *    e.g. AppError("Order not found", 404), AppError("Unknown stock", 400)
 *    → uses err.statusCode directly (400 / 401 / 404 / 500)
 *
 * 2. HttpError (routing-controllers — thrown for validation failures, bad body)
 *    e.g. HttpError(400, "Validation failed") from @Body({ validate: true })
 *    → uses err.httpCode directly
 *
 * 3. Plain Error (unexpected crash — null ref, type error, etc.)
 *    → always 500, never expose internals to client
 */
export function globalErrorHandler(
  err: Error | AppError | HttpError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }

  // ── 1. AppError — operational errors from services ────────────────────────
  if (err instanceof AppError) {
    logger.error(`${err.name}: ${err.message}`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: err.statusCode,
      requestId: req.requestId,
    });

    const response: ApiErrorResponse = {
      success: false,
      message: err.message,
      statusCode: err.statusCode,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // ── 2. HttpError — routing-controllers validation / bad request errors ────
  if (err instanceof HttpError) {
    logger.error(`HttpError ${err.httpCode}: ${err.message}`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: err.httpCode,
      requestId: req.requestId,
    });

    const response: ApiErrorResponse = {
      success: false,
      message: err.message,
      statusCode: err.httpCode,
    };
    res.status(err.httpCode).json(response);
    return;
  }

  // ── 3. Unexpected crash — never expose internals to client ────────────────
  logger.error(`UNEXPECTED ERROR: ${err.message}`, {
    method: req.method,
    url: req.originalUrl,
    stack: err.stack,
    requestId: req.requestId,
  });

  const response: ApiErrorResponse = {
    success: false,
    message: ERROR_MESSAGES.GENERIC.INTERNAL_SERVER_ERROR,
    statusCode: 500,
  };
  res.status(500).json(response);
}
