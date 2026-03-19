import "reflect-metadata";
import {
  calculateStockAmount,
  calculateShares,
  calculateActualAmount,
  truncateToDecimalPlaces,
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
    it("should return a non-empty object with numeric prices", () => {
      const stocks = getAvailableStocks();
      expect(Object.keys(stocks).length).toBeGreaterThan(0);
      Object.values(stocks).forEach((p) => expect(typeof p).toBe("number"));
    });

    it("should contain AAPL, TSLA and MSFT", () => {
      const stocks = getAvailableStocks();
      expect(stocks["AAPL"]).toBeDefined();
      expect(stocks["TSLA"]).toBeDefined();
      expect(stocks["MSFT"]).toBeDefined();
    });
  });

  // ─── calculateStockAmount ─────────────────────────────────────────────────
  describe("calculateStockAmount", () => {
    it("60% of $100 = $60", () => expect(calculateStockAmount(100, 60)).toBe(60));
    it("40% of $1000 = $400", () => expect(calculateStockAmount(1000, 40)).toBe(400));
    it("0% = $0", () => expect(calculateStockAmount(500, 0)).toBe(0));
    it("100% = full amount", () => expect(calculateStockAmount(500, 100)).toBe(500));
  });

  // ─── truncateToDecimalPlaces ──────────────────────────────────────────────
  describe("truncateToDecimalPlaces", () => {
    it("truncates 1.63265 to 3dp → 1.632 (no round-up)", () => {
      expect(truncateToDecimalPlaces(1.63265, 3)).toBe(1.632);
    });

    it("truncates 1.99999 to 2dp → 1.99 (not 2.00)", () => {
      expect(truncateToDecimalPlaces(1.99999, 2)).toBe(1.99);
    });

    it("truncates 1.9 to 0dp → 1 (not 2)", () => {
      expect(truncateToDecimalPlaces(1.9, 0)).toBe(1);
    });

    it("value unchanged when actual decimal digits < requested places", () => {
      expect(truncateToDecimalPlaces(1.63265306122449, 20)).toBe(1.63265306122449);
    });

    it("integer input returns same integer", () => {
      expect(truncateToDecimalPlaces(100, 3)).toBe(100);
    });

    it("handles zero correctly", () => {
      expect(truncateToDecimalPlaces(0, 3)).toBe(0);
    });

    it("handles scientific notation — 3.157e-7 to 3dp → 0 (not 3.157)", () => {
      // Bug case: 0.06 / 189999.5 = 3.157e-7
      // toString() = "3.157901e-7" → naive slice gives "3.157" (WRONG)
      // toFixed()  = "0.0000003157..." → slice gives "0.000" = 0 (CORRECT)
      const raw = 0.06 / 189999.5;  // 3.157e-7
      expect(truncateToDecimalPlaces(raw, 3)).toBe(0);
    });

    it("handles small decimals like 0.000163 to 3dp → 0", () => {
      // 0.04 / 245 = 0.000163... — cannot buy any shares at 3dp precision
      const raw = 0.04 / 245;
      expect(truncateToDecimalPlaces(raw, 3)).toBe(0);
    });
  });

  // ─── resolveStockPrice ───────────────────────────────────────────────────
  describe("resolveStockPrice", () => {
    it("should use marketPrice when provided", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60, marketPrice: 189.5 };
      expect(resolveStockPrice(stock)).toBe(189.5);
    });

    it("should fall back to stocks.json when no marketPrice", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60 };
      expect(resolveStockPrice(stock)).toBe(100);
    });

    it("should be case-insensitive", () => {
      expect(resolveStockPrice({ ticker: "aapl", percentage: 60 }))
        .toBe(resolveStockPrice({ ticker: "AAPL", percentage: 60 }));
    });
  });

  // ─── validateStockSymbols ────────────────────────────────────────────────
  describe("validateStockSymbols", () => {
    it("returns valid=true for known tickers", () => {
      const result = validateStockSymbols([
        { ticker: "AAPL", percentage: 60 },
        { ticker: "TSLA", percentage: 40 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.invalidSymbols).toEqual([]);
    });

    it("returns valid=false with unknown ticker in invalidSymbols", () => {
      const result = validateStockSymbols([
        { ticker: "AAPL", percentage: 60 },
        { ticker: "FAKECOIN", percentage: 40 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.invalidSymbols).toContain("FAKECOIN");
    });

    it("is case-insensitive — lowercase ticker passes", () => {
      expect(validateStockSymbols([{ ticker: "aapl", percentage: 100 }]).valid).toBe(true);
    });

    it("reports all invalid symbols at once", () => {
      const result = validateStockSymbols([
        { ticker: "FAKE1", percentage: 50 },
        { ticker: "FAKE2", percentage: 50 },
      ]);
      expect(result.invalidSymbols).toHaveLength(2);
    });
  });

  // ─── validatePortfolioWeights ────────────────────────────────────────────
  describe("validatePortfolioWeights", () => {
    it("returns valid=true for exact 60/40 split", () => {
      const result = validatePortfolioWeights([
        { ticker: "AAPL", percentage: 60 },
        { ticker: "TSLA", percentage: 40 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.total).toBe(100);
    });

    it("returns valid=true within ±0.001 float tolerance", () => {
      expect(validatePortfolioWeights([
        { ticker: "AAPL", percentage: 33.333 },
        { ticker: "TSLA", percentage: 33.333 },
        { ticker: "MSFT", percentage: 33.334 },
      ]).valid).toBe(true);
    });

    it("returns valid=false when sum is 90", () => {
      const result = validatePortfolioWeights([
        { ticker: "AAPL", percentage: 60 },
        { ticker: "TSLA", percentage: 30 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.total).toBe(90);
    });

    it("returns valid=false when sum exceeds 100", () => {
      expect(validatePortfolioWeights([
        { ticker: "AAPL", percentage: 70 },
        { ticker: "TSLA", percentage: 50 },
      ]).valid).toBe(false);
    });
  });

  // ─── calculateShares ─────────────────────────────────────────────────────
  describe("calculateShares", () => {
    it("$60 at $100/share → 0.6 shares", () => {
      expect(calculateShares(60, { ticker: "AAPL", percentage: 60 })).toBe(0.6);
    });

    it("$60 at marketPrice $200 → 0.3 shares", () => {
      expect(calculateShares(60, { ticker: "AAPL", percentage: 60, marketPrice: 200 })).toBe(0.3);
    });

    it("uses floor not round — $400 at $245 → 1.632, not 1.633", () => {
      // 400/245 = 1.63265... Math.round would give 1.633 (exceeds budget)
      // Math.floor gives 1.632 — always stays within allocation
      expect(calculateShares(400, { ticker: "TSLA", percentage: 40, marketPrice: 245 })).toBe(1.632);
    });

    it("shares × price should never exceed the allocated amount", () => {
      const stock: StockHolding = { ticker: "TSLA", percentage: 40, marketPrice: 245 };
      const allocated = 400;
      const shares = calculateShares(allocated, stock);
      const actualCost = calculateActualAmount(shares, stock);
      expect(actualCost).toBeLessThanOrEqual(allocated);
    });
  });

  // ─── calculateActualAmount ────────────────────────────────────────────────
  describe("calculateActualAmount", () => {
    it("truncates (not rounds) to AMOUNT_DECIMAL_PLACES — never overstates cost", () => {
      // 0.003 × 189999.5 = 569.9985
      // Math.round(2dp) → 570.00  (overstates — WRONG)
      // truncate(3dp)   → 569.998 (actual cost — CORRECT)
      const stock: StockHolding = { ticker: "AAPL", percentage: 60, marketPrice: 189999.5 };
      expect(calculateActualAmount(0.003, stock)).toBe(569.998);
      expect(calculateActualAmount(0.003, stock)).not.toBe(570);
    });

    it("3.166 shares × $189.5 = 599.957 → truncates to 599.957 (3dp)", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60, marketPrice: 189.5 };
      expect(calculateActualAmount(3.166, stock)).toBe(599.957);
    });

    it("whole shares × $100 = exact amount", () => {
      expect(calculateActualAmount(0.6, { ticker: "AAPL", percentage: 60 })).toBe(60);
    });

    it("amount should always be <= allocated amount (no round-up)", () => {
      const stock: StockHolding = { ticker: "AAPL", percentage: 60, marketPrice: 189999.5 };
      const allocated = 950;
      const shares = calculateShares(allocated, stock);
      const actual = calculateActualAmount(shares, stock);
      expect(actual).toBeLessThanOrEqual(allocated);
    });
  });

  // ─── buildOrderLegs ──────────────────────────────────────────────────────
  describe("buildOrderLegs", () => {
    it("should produce legs with ticker, percentage, shares, price, amount fields", () => {
      const stocks: StockHolding[] = [
        { ticker: "aapl", percentage: 60 },
        { ticker: "tsla", percentage: 40 },
      ];
      const legs: OrderLeg[] = buildOrderLegs(stocks, 100);

      expect(legs).toHaveLength(2);

      const aapl = legs[0];
      expect(aapl.ticker).toBe("AAPL");      // uppercase
      expect(aapl.percentage).toBe(60);
      expect(aapl.shares).toBe(0.6);
      expect(aapl.price).toBe(100);
      expect(aapl.amount).toBe(60);          // 0.6 × $100 = $60 exact

      const tsla = legs[1];
      expect(tsla.ticker).toBe("TSLA");
      expect(tsla.shares).toBe(0.4);
      expect(tsla.amount).toBe(40);
    });

    it("amount = shares × price (not raw allocation) when price causes rounding", () => {
      // $1000, 60% → allocated=$600, price=$189.5
      // shares = 600/189.5 = 3.166 (3dp)
      // amount = 3.166 × 189.5 = 599.96 (NOT 600)
      const stocks: StockHolding[] = [
        { ticker: "AAPL", percentage: 60, marketPrice: 189.5 },
        { ticker: "TSLA", percentage: 40, marketPrice: 189.5 },
      ];
      const legs = buildOrderLegs(stocks, 1000);
      const aapl = legs[0];

      expect(aapl.shares).toBe(3.166);
      expect(aapl.amount).toBe(599.957);      // truncate(3.166 × 189.5, 3dp) = 599.957
      expect(aapl.amount).not.toBe(600);      // NOT the raw 60% allocation
    });

    it("should use marketPrice when provided", () => {
      const legs = buildOrderLegs([
        { ticker: "AAPL", percentage: 100, marketPrice: 200 },
      ], 100);
      expect(legs[0].price).toBe(200);
      expect(legs[0].shares).toBe(0.5);
      expect(legs[0].amount).toBe(100);       // 0.5 × $200 = $100 exact
    });

    it("should uppercase tickers", () => {
      expect(buildOrderLegs([{ ticker: "msft", percentage: 100 }], 100)[0].ticker).toBe("MSFT");
    });
  });

  // ─── getNextMarketOpenDate ────────────────────────────────────────────────
  describe("getNextMarketOpenDate", () => {
    it("should return a valid ISO date string", () => {
      const result = getNextMarketOpenDate();
      expect(new Date(result).toISOString()).toBe(result);
    });

    it("should return today or a future date (same-day if before market open)", () => {
      expect(new Date(getNextMarketOpenDate()).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    });

    it("should be a weekday (Mon–Fri)", () => {
      const day = new Date(getNextMarketOpenDate()).getUTCDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    });

    it("should schedule at 9:30 AM ET (UTC offset depends on DST)", () => {
      const d = new Date(getNextMarketOpenDate());
      expect(d.getUTCMinutes()).toBe(30);
      // Hours are 13 (EDT summer) or 14 (EST winter) — both valid
    });
  });

  // ─── generateOrderId ─────────────────────────────────────────────────────
  describe("generateOrderId", () => {
    it("should start with ORD-", () => {
      expect(generateOrderId()).toMatch(/^ORD-/);
    });

    it("should generate unique IDs", () => {
      const ids = Array.from({ length: 100 }, () => generateOrderId());
      expect(new Set(ids).size).toBe(100);
    });
  });
});
