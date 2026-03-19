import { Request, Response, NextFunction } from "express";
import { HttpError } from "routing-controllers";
import { ValidationError } from "class-validator";
import { AppError } from "../errors/AppError";
import { ApiErrorResponse } from "../types";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { logger } from "./loggerMiddleware";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractValidationMessages(
  errors: ValidationError[],
  parentPath = ""
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }
    if (error.children && error.children.length > 0) {
      messages.push(...extractValidationMessages(error.children, path));
    }
  }
  return messages;
}

function isValidationHttpError(
  err: HttpError
): err is HttpError & { errors: ValidationError[] } {
  const e = err as unknown as Record<string, unknown>;
  return Array.isArray(e["errors"]) && e["errors"] !== null;
}

// ─── Severity helper ─────────────────────────────────────────────────────────

/**
 * Picks log severity based on HTTP status code.
 *
 *   5xx → ERROR  (server fault — needs alert)
 *   4xx → WARN   (client error — expected, should NOT fire production alerts)
 *   other → INFO
 */
function logForStatus(statusCode: number, message: string, meta: Record<string, unknown>): void {
  if (statusCode >= 500) {
    logger.error(message, meta);
  } else if (statusCode >= 400) {
    logger.warn(message, meta);
  } else {
    logger.info(message, meta);
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────

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

  const meta = { method: req.method, url: req.originalUrl, requestId: req.requestId };

  // ── 1. AppError — our own operational errors from services ────────────────
  if (err instanceof AppError) {
    logForStatus(err.statusCode, `${err.name}: ${err.message}`, {
      ...meta, statusCode: err.statusCode,
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
    let message: string;
    let errors: string[] | undefined;

    if (isValidationHttpError(err)) {
      const messages = extractValidationMessages(err.errors);
      message = messages.length > 0 ? messages.join("; ") : ERROR_MESSAGES.VALIDATION.FAILED;
      errors = messages;
    } else {
      message = err.message;
    }

    logForStatus(err.httpCode, `HttpError ${err.httpCode}: ${message}`, {
      ...meta, statusCode: err.httpCode,
    });

    const response: ApiErrorResponse = {
      success: false,
      message,
      statusCode: err.httpCode,
      ...(errors && { errors }),
    };
    res.status(err.httpCode).json(response);
    return;
  }

  // ── 3. Unexpected crash — always ERROR ────────────────────────────────────
  logger.error(`UNEXPECTED ERROR: ${err.message}`, {
    ...meta, stack: err.stack,
  });

  const response: ApiErrorResponse = {
    success: false,
    message: ERROR_MESSAGES.GENERIC.INTERNAL_SERVER_ERROR,
    statusCode: 500,
  };
  res.status(500).json(response);
}