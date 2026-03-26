/**
 * ERROR_MESSAGES
 * Central constants for all error messages used across the application.
 * Never hardcode error strings in services or controllers — reference this file.
 */
export const ERROR_MESSAGES = {
  // ─── Auth ──────────────────────────────────────────────────────────────
  AUTH: {
    INVALID_CREDENTIALS: "Invalid credentials",
    MISSING_TOKEN:
      "Unauthorized: Missing or malformed Authorization header. Expected: Bearer <token>",
    INVALID_TOKEN: "Unauthorized: Invalid or expired token",
  },

  // ─── Order ─────────────────────────────────────────────────────────────
  ORDER: {
    NOT_FOUND: (id: string) => `Order with ID '${id}' not found`,
    WEIGHTS_INVALID: (total: number) =>
      `Portfolio weights must sum to 100. Current sum: ${total.toFixed(2)}`,
    UNKNOWN_SYMBOLS: (symbols: string[], available: string) =>
      `Unknown stock symbol(s): ${symbols.join(", ")}. Available stocks: ${available}`,
  },

  // ─── Validation ────────────────────────────────────────────────────────
  VALIDATION: {
    FAILED: "Validation failed"
  },

  // ─── Generic ───────────────────────────────────────────────────────────
  GENERIC: {
    INTERNAL_SERVER_ERROR: "Internal server error",
    NOT_FOUND: (method: string, url: string) =>
      `Route '${method} ${url}' not found`,
  },
} as const;
