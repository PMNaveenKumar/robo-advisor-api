import config from "../config";
import stocksData from "../data/stocks.json";
import { OrderLeg, StockHolding } from "../types";

// Typed map of available stocks → default price
const AVAILABLE_STOCKS: Record<string, number> = stocksData;

/**
 * Returns all available stock symbols from stocks.json.
 */
export function getAvailableStocks(): Record<string, number> {
  return AVAILABLE_STOCKS;
}

/**
 * Validates that every ticker in the portfolio exists in stocks.json.
 * Returns the list of invalid symbols if any are found.
 */
export function validateStockSymbols(stocks: StockHolding[]): { valid: boolean; invalidSymbols: string[] } {
  const invalidSymbols: string[] = stocks
    .map((s: StockHolding) => s.ticker.toUpperCase())
    .filter((symbol: string) => !(symbol in AVAILABLE_STOCKS));

  return { valid: invalidSymbols.length === 0, invalidSymbols };
}

/**
 * Resolves the price for a stock:
 * 1. Use marketPrice if explicitly provided by the caller (partner override)
 * 2. Fall back to price in stocks.json
 * 3. Fall back to configured DEFAULT_STOCK_PRICE as a final safety net
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

/**
 * Calculates number of shares for a given dollar amount and stock.
 */
export function calculateShares(amount: number, stock: StockHolding): number {
  const price: number = resolveStockPrice(stock);
  return roundToDecimalPlaces(amount / price, config.business.shareDecimalPlaces);
}

/**
 * Rounds to N decimal places (configurable via SHARE_DECIMAL_PLACES in .env).
 */
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
 * Builds an OrderLeg for every stock: resolves price, calculates amount and shares.
 */
export function buildOrderLegs(stocks: StockHolding[], totalAmount: number): OrderLeg[] {
  return stocks.map((stock: StockHolding): OrderLeg => {
    const symbol: string = stock.ticker.toUpperCase();
    const amount: number = calculateStockAmount(totalAmount, stock.percentage);
    const priceUsed: number = resolveStockPrice(stock);
    const shares: number = calculateShares(amount, stock);

    return {
      symbol,
      percentage: stock.percentage,
      amount: roundToDecimalPlaces(amount, 2),
      shares,
      priceUsed,
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
