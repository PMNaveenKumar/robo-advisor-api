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
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    // Leaf node — has constraint messages
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }

    // Nested errors (e.g. portfolio.stocks[0].ticker)
    if (error.children && error.children.length > 0) {
      messages.push(...extractValidationMessages(error.children, path));
    }
  }

  return messages;
}

/**
 * Checks whether an error is a routing-controllers validation HttpError
 * by looking for the err.errors[] array of ValidationError objects.
 */
function isValidationHttpError(
  err: HttpError
): err is HttpError & { errors: ValidationError[] } {
  const errAsUnknown = err as unknown as Record<string, unknown>;
  return (
    Array.isArray(errAsUnknown["errors"]) &&
    errAsUnknown["errors"] !== null
  );
}

// ─── Global Error Handler ─────────────────────────────────────────────────────

/**
 * globalErrorHandler
 * Handles ALL errors in one place — AppError, HttpError (with validation details),
 * and unexpected plain Errors.
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

  // ── 1. AppError — our own operational errors from services ────────────────
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

  // ── 2. HttpError — routing-controllers errors ─────────────────────────────
  if (err instanceof HttpError) {
    let message: string;
    let errors: string[] | undefined;

    if (isValidationHttpError(err)) {
      // class-validator errors — extract per-field messages from err.errors[]
      const messages = extractValidationMessages(err.errors);
      message = messages.length > 0
        ? messages.join("; ")
        : ERROR_MESSAGES.VALIDATION.FAILED;
      errors = messages;
    } else {
      message = err.message;
    }

    logger.error(`HttpError ${err.httpCode}: ${message}`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: err.httpCode,
      requestId: req.requestId,
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
