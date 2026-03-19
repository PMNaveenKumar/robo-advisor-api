import stocksData from "../data/stocks.json";
import { OrderLeg, StockHolding } from "../types";
import config from "../config";

const AVAILABLE_STOCKS: Record<string, number> = stocksData;

// ─── Market scheduling ────────────────────────────────────────────────────────
// Hours/minutes are read from config (set via .env MARKET_OPEN_HOUR etc.)
// so trading window can be changed without touching code.

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

  if (utcDay === 0 || utcDay === 6) return false;

  const marketOpen  = toUtcTime(now, config.market.openHour,  config.market.openMinute,  offsetMinutes);
  const marketClose = toUtcTime(now, config.market.closeHour, config.market.closeMinute, offsetMinutes);
  return now >= marketOpen && now < marketClose;
}

export function getNextMarketOpenDate(): string {
  try {
    const now    = new Date();
    const utcDay = now.getUTCDay();

    let daysToAdd = 1;
    if (utcDay === 5) daysToAdd = 3;
    if (utcDay === 6) daysToAdd = 2;

    const nextDate   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToAdd));
    const nextOffset = getEasternOffsetMinutes(nextDate);
    const nextOpen   = toUtcTime(nextDate, config.market.openHour, config.market.openMinute, nextOffset);

    return nextOpen.toISOString();
  } catch {
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
  const offsetMinutes = getEasternOffsetMinutes(new Date());
  const tzLabel       = offsetMinutes === -300 ? "EST (UTC-5)" : "EDT (UTC-4)";

  const pad = (n: number) => String(n).padStart(2, "0");
  const openTime  = `${pad(config.market.openHour)}:${pad(config.market.openMinute)} ET (${tzLabel})`;
  const closeTime = `${pad(config.market.closeHour)}:${pad(config.market.closeMinute)} ET (${tzLabel})`;

  return {
    tradingDays:   "Monday to Friday",
    openTime,
    closeTime,
    timezone:      "America/New_York",
    currentlyOpen: isMarketOpen(),
    nextOpenAt:    isMarketOpen() ? null : getNextMarketOpenDate(),
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
