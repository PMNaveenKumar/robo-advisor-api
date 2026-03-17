import "reflect-metadata";
import {
  calculateStockAmount,
  calculateShares,
  roundToDecimalPlaces,
  validatePortfolioWeights,
  validateStockSymbols,
  resolveStockPrice,
  buildOrderLegs,
  getNextMarketOpenDate,
  generateOrderId,
  getAvailableStocks,
} from "../../src/helpers/helper";
import { StockHolding, OrderLeg } from "../../src/types";

describe("helper.ts", () => {

  // ─── getAvailableStocks ───────────────────────────────────────────────────
  describe("getAvailableStocks", () => {
    it("should return a non-empty object", () => {
      const stocks = getAvailableStocks();
      expect(Object.keys(stocks).length).toBeGreaterThan(0);
    });

    it("should contain AAPL, TSLA, MSFT", () => {
      const stocks = getAvailableStocks();
      expect(stocks["AAPL"]).toBeDefined();
      expect(stocks["TSLA"]).toBeDefined();
      expect(stocks["MSFT"]).toBeDefined();
    });

    it("should return numeric prices for each ticker", () => {
      const stocks = getAvailableStocks();
      Object.values(stocks).forEach((price) => {
        expect(typeof price).toBe("number");
        expect(price).toBeGreaterThan(0);
      });
    });
  });

  // ─── calculateStockAmount ─────────────────────────────────────────────────
  describe("calculateStockAmount", () => {
    it("should return 60 for 60% of $100", () => {
      expect(calculateStockAmount(100, 60)).toBe(60);
    });

    it("should return 400 for 40% of $1000", () => {
      expect(calculateStockAmount(1000, 40)).toBe(400);
    });

    it("should return 62.5 for 25% of $250", () => {
      expect(calculateStockAmount(250, 25)).toBe(62.5);
    });

    it("should return 0 when percentage is 0", () => {
      expect(calculateStockAmount(500, 0)).toBe(0);
    });

    it("should return full amount when percentage is 100", () => {
      expect(calculateStockAmount(500, 100)).toBe(500);
    });
  });

  // ─── roundToDecimalPlaces ─────────────────────────────────────────────────
  describe("roundToDecimalPlaces", () => {
    it("should round 1.23456 to 3 dp → 1.235", () => {
      expect(roundToDecimalPlaces(1.23456, 3)).toBe(1.235);
    });

    it("should round 1.23456 to 2 dp → 1.23", () => {
      expect(roundToDecimalPlaces(1.23456, 2)).toBe(1.23);
    });

    it("should round 1.23456 to 0 dp → 1", () => {
      expect(roundToDecimalPlaces(1.23456, 0)).toBe(1);
    });

    it("should handle float precision edge case: 0.1 + 0.2 → 0.3", () => {
      expect(roundToDecimalPlaces(0.1 + 0.2, 1)).toBe(0.3);
    });

    it("should not change an already rounded value", () => {
      expect(roundToDecimalPlaces(0.6, 3)).toBe(0.6);
    });
  });

  // ─── resolveStockPrice ───────────────────────────────────────────────────
  describe("resolveStockPrice", () => {
    it("should use marketPrice when explicitly provided", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60, marketPrice: 189.5 };
      expect(resolveStockPrice(stock)).toBe(189.5);
    });

    it("should fall back to stocks.json price when no marketPrice", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60 };
      expect(resolveStockPrice(stock)).toBe(100);
    });

    it("should be case-insensitive — lowercase ticker resolves to same price", () => {
      const upper: StockHolding = { ticker: "AAPL", percentage: 60 };
      const lower: StockHolding = { ticker: "aapl", percentage: 60 };
      expect(resolveStockPrice(upper)).toBe(resolveStockPrice(lower));
    });
  });

  // ─── validateStockSymbols ────────────────────────────────────────────────
  describe("validateStockSymbols", () => {
    it("should return valid=true, empty invalidSymbols for known tickers", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 60 },
        { ticker: "TSLA", percentage: 40 },
      ];
      const result = validateStockSymbols(stocks);
      expect(result.valid).toBe(true);
      expect(result.invalidSymbols).toEqual([]);
    });

    it("should return valid=false with FAKECOIN in invalidSymbols", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 60 },
        { ticker: "FAKECOIN", percentage: 40 },
      ];
      const result = validateStockSymbols(stocks);
      expect(result.valid).toBe(false);
      expect(result.invalidSymbols).toContain("FAKECOIN");
    });

    it("should treat lowercase tickers as valid (case-insensitive)", () => {
      const stocks: StockHolding[] = [{ ticker: "aapl", percentage: 100 }];
      const result = validateStockSymbols(stocks);
      expect(result.valid).toBe(true);
    });

    it("should report all invalid symbols at once", () => {
      const stocks: StockHolding[] = [
        { ticker: "FAKE1", percentage: 50 },
        { ticker: "FAKE2", percentage: 50 },
      ];
      const result = validateStockSymbols(stocks);
      expect(result.valid).toBe(false);
      expect(result.invalidSymbols).toHaveLength(2);
      expect(result.invalidSymbols).toContain("FAKE1");
      expect(result.invalidSymbols).toContain("FAKE2");
    });
  });

  // ─── validatePortfolioWeights ────────────────────────────────────────────
  describe("validatePortfolioWeights", () => {
    it("should return valid=true, total=100 for exact 60/40 split", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 60 },
        { ticker: "TSLA", percentage: 40 },
      ];
      const result = validatePortfolioWeights(stocks);
      expect(result.valid).toBe(true);
      expect(result.total).toBe(100);
    });

    it("should return valid=true for float weights within ±0.001 tolerance", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 33.333 },
        { ticker: "TSLA", percentage: 33.333 },
        { ticker: "MSFT", percentage: 33.334 },
      ];
      expect(validatePortfolioWeights(stocks).valid).toBe(true);
    });

    it("should return valid=false, total=90 when weights sum to 90", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 60 },
        { ticker: "TSLA", percentage: 30 },
      ];
      const result = validatePortfolioWeights(stocks);
      expect(result.valid).toBe(false);
      expect(result.total).toBe(90);
    });

    it("should return valid=false when weights exceed 100", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 70 },
        { ticker: "TSLA", percentage: 50 },
      ];
      expect(validatePortfolioWeights(stocks).valid).toBe(false);
    });
  });

  // ─── calculateShares ─────────────────────────────────────────────────────
  describe("calculateShares", () => {
    it("should return 0.6 shares for $60 at default $100 price", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60 };
      expect(calculateShares(60, stock)).toBe(0.6);
    });

    it("should return 0.3 shares for $60 at marketPrice $200", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60, marketPrice: 200 };
      expect(calculateShares(60, stock)).toBe(0.3);
    });

    it("should round to 3 decimal places: $40 / $300 = 0.133", () => {
      const stock: StockHolding = { ticker: "TSLA", percentage: 40, marketPrice: 300 };
      expect(calculateShares(40, stock)).toBe(0.133);
    });
  });

  // ─── buildOrderLegs ──────────────────────────────────────────────────────
  describe("buildOrderLegs", () => {
    it("should produce 2 legs with correct symbol, amount, shares, priceUsed", () => {
      const stocks: StockHolding[] = [
        { ticker: "aapl", percentage: 60 },
        { ticker: "tsla", percentage: 40 },
      ];
      const legs: OrderLeg[] = buildOrderLegs(stocks, 100);

      expect(legs).toHaveLength(2);

      const aapl = legs[0];
      expect(aapl.symbol).toBe("AAPL");
      expect(aapl.amount).toBe(60);
      expect(aapl.shares).toBe(0.6);
      expect(aapl.priceUsed).toBe(100);
      expect(aapl.percentage).toBe(60);

      const tsla = legs[1];
      expect(tsla.symbol).toBe("TSLA");
      expect(tsla.amount).toBe(40);
      expect(tsla.shares).toBe(0.4);
    });

    it("should use marketPrice when provided, not the stocks.json price", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 100, marketPrice: 200 },
      ];
      const legs: OrderLeg[] = buildOrderLegs(stocks, 100);
      expect(legs[0].priceUsed).toBe(200);
      expect(legs[0].shares).toBe(0.5);
    });

    it("should uppercase symbols regardless of input case", () => {
      const stocks: StockHolding[] = [{ ticker: "msft", percentage: 100 }];
      const legs: OrderLeg[] = buildOrderLegs(stocks, 100);
      expect(legs[0].symbol).toBe("MSFT");
    });

    it("should round amount to 2 decimal places", () => {
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 33.333 },
        { ticker: "TSLA", percentage: 33.333 },
        { ticker: "MSFT", percentage: 33.334 },
      ];
      const legs: OrderLeg[] = buildOrderLegs(stocks, 100);
      legs.forEach((leg) => {
        const decimalPlaces = (leg.amount.toString().split(".")[1] ?? "").length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      });
    });
  });

  // ─── getNextMarketOpenDate ────────────────────────────────────────────────
  describe("getNextMarketOpenDate", () => {
    it("should return a valid ISO 8601 date string", () => {
      const result: string = getNextMarketOpenDate();
      expect(new Date(result).toISOString()).toBe(result);
    });

    it("should return a date in the future", () => {
      expect(new Date(getNextMarketOpenDate()).getTime()).toBeGreaterThan(Date.now());
    });

    it("should return a weekday (Mon=1 through Fri=5)", () => {
      const day = new Date(getNextMarketOpenDate()).getUTCDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    });

    it("should schedule at 14:30 UTC (9:30 AM ET)", () => {
      const d = new Date(getNextMarketOpenDate());
      expect(d.getUTCHours()).toBe(14);
      expect(d.getUTCMinutes()).toBe(30);
      expect(d.getUTCSeconds()).toBe(0);
    });
  });

  // ─── generateOrderId ─────────────────────────────────────────────────────
  describe("generateOrderId", () => {
    it("should start with ORD-", () => {
      expect(generateOrderId()).toMatch(/^ORD-/);
    });

    it("should contain a timestamp segment", () => {
      const id = generateOrderId();
      const parts = id.split("-");
      expect(parts.length).toBeGreaterThanOrEqual(3);
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThan(0);
    });

    it("should generate 100 unique IDs with no duplicates", () => {
      const ids = Array.from({ length: 100 }, () => generateOrderId());
      expect(new Set(ids).size).toBe(100);
    });
  });
});
