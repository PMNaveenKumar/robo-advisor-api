/**
 * AppError
 * Custom error class used across services and controllers.
 *
 * Why a custom class instead of HttpError from routing-controllers?
 * - Services should NOT know about HTTP concepts (status codes are HTTP-layer concerns)
 * - AppError carries both a human message AND a statusCode so the error middleware
 *   can respond correctly without guessing from the message string
 * - instanceof checks in globalErrorHandler reliably distinguish AppError
 *   from unexpected runtime errors (TypeError, ReferenceError, etc.)
 *
 * Flow:
 *   Service throws AppError  →  Controller catch re-throws it  →  globalErrorHandler reads it
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    // isOperational = true means it's a known, expected error (400/401/404)
    // isOperational = false would mean an unexpected crash (500)
    this.isOperational = statusCode < 500;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}
