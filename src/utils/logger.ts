import fs from "fs";
import path from "path";

// ─── Log Level Types ──────────────────────────────────────────────────────────

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

// ─── Logger Class ─────────────────────────────────────────────────────────────

/**
 * Logger
 * Writes structured JSON log entries to daily rotating files under /logs.
 *
 * Files created:
 *   logs/access-YYYY-MM-DD.log  → INFO and WARN entries (all HTTP traffic)
 *   logs/error-YYYY-MM-DD.log   → ERROR entries only
 *
 * Also mirrors every entry to the console for developer visibility.
 */
export class Logger {
  private readonly logsDir: string;

  constructor() {
    // Always resolve logs/ relative to the project root (two levels up from src/utils)
    this.logsDir = path.resolve(__dirname, "..", "..", "logs");
    this.ensureLogsDir();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("INFO", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("WARN", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("ERROR", message, meta);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta && { meta }),
    };

    const line: string = JSON.stringify(entry) + "\n";

    // Mirror to console
    this.consoleOutput(level, line.trim());

    // Write to access log (INFO + WARN) or error log (ERROR)
    const fileName: string = level === "ERROR"
      ? `error-${this.todayDate()}.log`
      : `access-${this.todayDate()}.log`;

    const filePath: string = path.join(this.logsDir, fileName);

    try {
      fs.appendFileSync(filePath, line, "utf8");
    } catch (err: unknown) {
      console.error(`[Logger] Failed to write to ${filePath}:`, err);
    }
  }

  private consoleOutput(level: LogLevel, line: string): void {
    if (level === "ERROR") {
      console.error(line);
    } else if (level === "WARN") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }
}
