import stocksData from "../data/stocks.json";
import { OrderLeg, StockHolding } from "../types";
import config from "../config";

const AVAILABLE_STOCKS: Record<string, number> = stocksData;

// ─── Market scheduling constants ─────────────────────────────────────────────
const MARKET_OPEN_HOUR_ET   = 9;
const MARKET_OPEN_MINUTE_ET = 30;
const MARKET_CLOSE_HOUR_ET  = 16; // 4:00 PM ET
const MARKET_CLOSE_MINUTE_ET = 0;

/**
 * Returns the UTC offset in minutes for America/New_York at a given date.
 * Uses the Intl API — no external library, handles DST automatically.
 *
 *   EST (winter): UTC-5  → offset = -300
 *   EDT (summer): UTC-4  → offset = -240
 */
function getEasternOffsetMinutes(date: Date): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const etDate  = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return (etDate.getTime() - utcDate.getTime()) / 60000;
}

/**
 * Builds a UTC Date for a given ET hour/minute on a specific UTC calendar date.
 */
function toUtcTime(
  date: Date,
  etHour: number,
  etMinute: number,
  offsetMinutes: number
): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    etHour - Math.trunc(offsetMinutes / 60),
    etMinute - (offsetMinutes % 60),
    0, 0
  ));
}

/**
 * Returns true if the market is currently open:
 *   - It is a weekday (Mon–Fri)
 *   - Current time is between 9:30 AM ET and 4:00 PM ET (inclusive open, exclusive close)
 */
export function isMarketOpen(): boolean {
  const now           = new Date();
  const utcDay        = now.getUTCDay();
  const offsetMinutes = getEasternOffsetMinutes(now);

  if (utcDay === 0 || utcDay === 6) return false; // weekend

  const marketOpen  = toUtcTime(now, MARKET_OPEN_HOUR_ET,  MARKET_OPEN_MINUTE_ET,  offsetMinutes);
  const marketClose = toUtcTime(now, MARKET_CLOSE_HOUR_ET, MARKET_CLOSE_MINUTE_ET, offsetMinutes);

  return now >= marketOpen && now < marketClose;
}

/**
 * Returns the ISO timestamp of the next market open (9:30 AM ET, next weekday).
 * Falls back to tomorrow 14:30 UTC if the Intl API fails — scheduling errors
 * must never cause a 500 on the split order response.
 */
export function getNextMarketOpenDate(): string {
  try {
    const now    = new Date();
    const utcDay = now.getUTCDay();

    let daysToAdd = 1;
    if (utcDay === 5) daysToAdd = 3; // Friday   → Monday
    if (utcDay === 6) daysToAdd = 2; // Saturday → Monday

    const nextDate   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToAdd));
    const nextOffset = getEasternOffsetMinutes(nextDate);
    const nextOpen   = toUtcTime(nextDate, MARKET_OPEN_HOUR_ET, MARKET_OPEN_MINUTE_ET, nextOffset);

    return nextOpen.toISOString();
  } catch {
    // Intl API unavailable or unexpected failure — fall back to tomorrow 14:30 UTC
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + 1);
    fallback.setUTCHours(14, 30, 0, 0);
    return fallback.toISOString();
  }
}

/**
 * Returns human-readable market schedule information.
 * Included in every split order response so partners always know trading hours.
 */
export function getMarketInfo(): MarketInfo {
  const now           = new Date();
  const offsetMinutes = getEasternOffsetMinutes(now);
  const offsetHours   = Math.abs(Math.trunc(offsetMinutes / 60));
  const tzLabel       = offsetMinutes === -300 ? "EST (UTC-5)" : "EDT (UTC-4)";

  return {
    tradingDays: "Monday to Friday",
    openTime:    `09:30 AM ET (${tzLabel})`,
    closeTime:   `04:00 PM ET (${tzLabel})`,
    timezone:    "America/New_York",
    currentlyOpen: isMarketOpen(),
    nextOpenAt:  isMarketOpen() ? null : getNextMarketOpenDate(),
  };
}

export interface MarketInfo {
  tradingDays:   string;
  openTime:      string;
  closeTime:     string;
  timezone:      string;
  currentlyOpen: boolean;
  nextOpenAt:    string | null;  // null when market is currently open
}

export function getAvailableStocks(): Record<string, number> {
  return AVAILABLE_STOCKS;
}

export function validateStockSymbols(stocks: StockHolding[]): { valid: boolean; invalidSymbols: string[] } {
  const invalidSymbols = stocks
    .map((s) => s.ticker.toUpperCase())
    .filter((sym) => !(sym in AVAILABLE_STOCKS));
  return { valid: invalidSymbols.length === 0, invalidSymbols };
}

export function resolveStockPrice(stock: StockHolding): number {
  if (stock.marketPrice !== undefined && stock.marketPrice > 0) {
    return stock.marketPrice;
  }
  return AVAILABLE_STOCKS[stock.ticker.toUpperCase()] ?? config.business.defaultStockPrice;
}

export function calculateStockAmount(totalAmount: number, percentage: number): number {
  return (totalAmount * percentage) / 100;
}

/**
 * Truncates (never rounds up) to N decimal places.
 * Uses toFixed() to avoid scientific notation on very small numbers.
 */
export function truncateToDecimalPlaces(value: number, places: number): number {
  const fixed = value.toFixed(places + 10);
  const dotIndex = fixed.indexOf(".");
  if (dotIndex === -1) return value;
  return parseFloat(fixed.slice(0, dotIndex + 1 + places));
}

export function calculateShares(allocatedAmount: number, stock: StockHolding): number {
  const price = resolveStockPrice(stock);
  return truncateToDecimalPlaces(allocatedAmount / price, config.business.shareDecimalPlaces);
}

export function calculateActualAmount(shares: number, stock: StockHolding): number {
  const price = resolveStockPrice(stock);
  return truncateToDecimalPlaces(shares * price, config.business.amountDecimalPlaces);
}

export function roundToDecimalPlaces(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

export function validatePortfolioWeights(stocks: StockHolding[]): { valid: boolean; total: number } {
  const total = stocks.reduce((sum, s) => sum + s.percentage, 0);
  return { valid: Math.abs(total - 100) < 0.001, total };
}

export function buildOrderLegs(stocks: StockHolding[], totalAmount: number): OrderLeg[] {
  return stocks.map((stock): OrderLeg => {
    const ticker    = stock.ticker.toUpperCase();
    const price     = resolveStockPrice(stock);
    const allocated = calculateStockAmount(totalAmount, stock.percentage);
    const shares    = calculateShares(allocated, stock);
    const amount    = calculateActualAmount(shares, stock);
    return { ticker, percentage: stock.percentage, amount, shares, price };
  });
}

export function generateOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}
