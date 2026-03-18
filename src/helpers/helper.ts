import config from "../config";
import stocksData from "../data/stocks.json";
import { OrderLeg, StockHolding } from "../types";

const AVAILABLE_STOCKS: Record<string, number> = stocksData;

export function getAvailableStocks(): Record<string, number> {
  return AVAILABLE_STOCKS;
}

export function validateStockSymbols(stocks: StockHolding[]): { valid: boolean; invalidSymbols: string[] } {
  const invalidSymbols: string[] = stocks
    .map((s: StockHolding) => s.ticker.toUpperCase())
    .filter((symbol: string) => !(symbol in AVAILABLE_STOCKS));
  return { valid: invalidSymbols.length === 0, invalidSymbols };
}

/**
 * Resolves price: marketPrice (partner override) → stocks.json → config fallback.
 */
export function resolveStockPrice(stock: StockHolding): number {
  if (stock.marketPrice !== undefined && stock.marketPrice > 0) {
    return stock.marketPrice;
  }
  const symbol: string = stock.ticker.toUpperCase();
  return AVAILABLE_STOCKS[symbol] ?? config.business.defaultStockPrice;
}

/**
 * Calculates the dollar amount allocated to a stock based on its portfolio percentage.
 */
export function calculateStockAmount(totalAmount: number, percentage: number): number {
  return (totalAmount * percentage) / 100;
}


export function truncateToDecimalPlaces(value: number, places: number): number {
  // Use extra digits beyond `places` to ensure toFixed has enough precision
  const fixed: string = value.toFixed(places + 10);
  const dotIndex: number = fixed.indexOf(".");
  if (dotIndex === -1) return value;
  return parseFloat(fixed.slice(0, dotIndex + 1 + places));
}

/**
 * Calculates shares: allocated amount ÷ price, truncated (floored) to configured
 * decimal places so shares × price never exceeds the allocated amount.
 */
export function calculateShares(allocatedAmount: number, stock: StockHolding): number {
  const price: number = resolveStockPrice(stock);
  const raw: number = allocatedAmount / price;
  return truncateToDecimalPlaces(raw, config.business.shareDecimalPlaces);
}

/**
 * Calculates the ACTUAL amount spent after share rounding: shares × price,
 *
 * Uses truncateToDecimalPlaces (not Math.round) so the amount never rounds
 *
 * Example:
 *   shares = 0.003,  price = $189,999.50
 *   raw    = 0.003 × 189999.5 = 569.9985
 *   Math.round(2dp) → 570.00  ❌ overstates actual cost
 *   truncate(3dp)   → 569.998 ✅ actual cost
 */
export function calculateActualAmount(shares: number, stock: StockHolding): number {
  const price: number = resolveStockPrice(stock);
  return truncateToDecimalPlaces(shares * price, config.business.amountDecimalPlaces);
}

export function roundToDecimalPlaces(value: number, places: number): number {
  const factor: number = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

/**
 * Validates that all portfolio stock weights sum to exactly 100 (±0.001 float tolerance).
 */
export function validatePortfolioWeights(stocks: StockHolding[]): { valid: boolean; total: number } {
  const total: number = stocks.reduce((sum: number, s: StockHolding) => sum + s.percentage, 0);
  return { valid: Math.abs(total - 100) < 0.001, total };
}

/**
 * Builds an OrderLeg for every stock.
 *
 * Calculation order (important):
 *   1. allocated = totalAmount × percentage%   (raw allocation)
 *   2. shares    = round(allocated ÷ price)    (rounded to SHARE_DECIMAL_PLACES)
 *   3. amount    = shares × price              (actual cost — avoids reconciliation gap)
 */
export function buildOrderLegs(stocks: StockHolding[], totalAmount: number): OrderLeg[] {
  return stocks.map((stock: StockHolding): OrderLeg => {
    const ticker: string = stock.ticker.toUpperCase();
    const price: number = resolveStockPrice(stock);
    const allocated: number = calculateStockAmount(totalAmount, stock.percentage);
    const shares: number = calculateShares(allocated, stock);
    const amount: number = calculateActualAmount(shares, stock); // shares × price

    return {
      ticker,
      percentage: stock.percentage,
      amount,   // actual cost after rounding — NOT the raw allocation
      shares,
      price,
    };
  });
}

/**
 * Returns the ISO timestamp of the next market open (Mon–Fri 9:30 AM ET = 14:30 UTC).
 */
export function getNextMarketOpenDate(): string {
  const now: Date = new Date();
  const day: number = now.getUTCDay();
  let daysToAdd = 1;
  if (day === 5) daysToAdd = 3; // Friday → Monday
  if (day === 6) daysToAdd = 2; // Saturday → Monday
  const next: Date = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysToAdd);
  next.setUTCHours(14, 30, 0, 0);
  return next.toISOString();
}

/**
 * Generates a unique order ID string.
 */
export function generateOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}
