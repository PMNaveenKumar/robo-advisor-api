import "reflect-metadata";
import Container from "typedi";
import { OrderService } from "../../src/services/OrderService";
import { OrderRepository } from "../../src/data/OrderRepository";
import { SplitOrderRequestSchema } from "../../src/schemas";
import { AppError } from "../../src/errors/AppError";
import { ERROR_MESSAGES } from "../../src/constants/errorMessages";
import { Order } from "../../src/types";

function makeValidRequest(overrides: Partial<SplitOrderRequestSchema> = {}): SplitOrderRequestSchema {
  const req = new SplitOrderRequestSchema();
  req.portfolio = {
    name: "Tech Growth",
    stocks: [
      { ticker: "AAPL", percentage: 60 },
      { ticker: "TSLA", percentage: 40 },
    ],
  };
  req.totalAmount = 100;
  req.orderType = "BUY";
  return Object.assign(req, overrides);
}

describe("OrderService", () => {
  let orderService: OrderService;
  let orderRepository: OrderRepository;

  beforeEach(() => {
    Container.reset();
    orderRepository = new OrderRepository();
    Container.set(OrderRepository, orderRepository);
    orderService = new OrderService(orderRepository);
  });

  afterEach(() => {
    orderRepository.clear();
  });

  // ─── splitOrder ───────────────────────────────────────────────────────────
  describe("splitOrder", () => {
    it("should return success=true with ORD- prefixed id and correct fields", () => {
      const result = orderService.splitOrder(makeValidRequest());

      expect(result.success).toBe(true);
      expect(result.data.id).toMatch(/^ORD-/);
      expect(result.data.orderType).toBe("BUY");
      expect(result.data.totalAmount).toBe(100);
      expect(result.data.createdAt).toBeDefined();
      expect(result.data.executeAt).toBeDefined();
    });

    it("should build legs with symbol, amount, shares, priceUsed, percentage", () => {
      const result = orderService.splitOrder(makeValidRequest());
      const { legs } = result.data;

      expect(legs).toHaveLength(2);

      const aapl = legs.find((l) => l.symbol === "AAPL");
      expect(aapl).toBeDefined();
      expect(aapl!.symbol).toBe("AAPL");
      expect(aapl!.amount).toBe(60);
      expect(aapl!.shares).toBe(0.6);
      expect(aapl!.priceUsed).toBe(100);
      expect(aapl!.percentage).toBe(60);

      const tsla = legs.find((l) => l.symbol === "TSLA");
      expect(tsla).toBeDefined();
      expect(tsla!.amount).toBe(40);
      expect(tsla!.shares).toBe(0.4);
    });

    it("should use marketPrice override instead of stocks.json price", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Custom",
          stocks: [{ ticker: "AAPL", percentage: 100, marketPrice: 200 }],
        },
        totalAmount: 100,
      });
      const result = orderService.splitOrder(req);

      expect(result.data.legs[0].priceUsed).toBe(200);
      expect(result.data.legs[0].shares).toBe(0.5);
    });

    it("should handle SELL order type correctly", () => {
      const result = orderService.splitOrder(makeValidRequest({ orderType: "SELL" }));
      expect(result.data.orderType).toBe("SELL");
    });

    it("should set executeAt to a future weekday at 14:30 UTC", () => {
      const result = orderService.splitOrder(makeValidRequest());
      const executeAt = new Date(result.data.executeAt);
      const day = executeAt.getUTCDay();

      expect(executeAt.getTime()).toBeGreaterThan(Date.now());
      expect(day).toBeGreaterThanOrEqual(1); // Mon
      expect(day).toBeLessThanOrEqual(5);    // Fri
      expect(executeAt.getUTCHours()).toBe(14);
      expect(executeAt.getUTCMinutes()).toBe(30);
    });

    it("should persist the order in the repository after split", () => {
      expect(orderRepository.count()).toBe(0);
      orderService.splitOrder(makeValidRequest());
      expect(orderRepository.count()).toBe(1);
    });

    it("should support a 4-stock equal-weight portfolio", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Balanced",
          stocks: [
            { ticker: "AAPL", percentage: 25 },
            { ticker: "TSLA", percentage: 25 },
            { ticker: "MSFT", percentage: 25 },
            { ticker: "AMZN", percentage: 25 },
          ],
        },
        totalAmount: 1000,
      });
      const result = orderService.splitOrder(req);

      expect(result.data.legs).toHaveLength(4);
      result.data.legs.forEach((leg) => {
        expect(leg.amount).toBe(250);
        expect(leg.shares).toBe(2.5);
      });
    });

    // ─── Business rule: Unknown symbol ────────────────────────────────────
    it("should throw AppError(400) with UNKNOWN_SYMBOLS message for invalid ticker", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Bad",
          stocks: [
            { ticker: "AAPL", percentage: 60 },
            { ticker: "FAKECOIN", percentage: 40 },
          ],
        },
      });
      let thrown: unknown;
      try {
        orderService.splitOrder(req);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(400);
      expect((thrown as AppError).message).toMatch(/Unknown stock symbol/);
      expect((thrown as AppError).message).toContain("FAKECOIN");
    });

    it("should report all invalid symbols in the error message", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Multi bad",
          stocks: [
            { ticker: "FAKE1", percentage: 50 },
            { ticker: "FAKE2", percentage: 50 },
          ],
        },
      });
      let thrown: unknown;
      try {
        orderService.splitOrder(req);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).message).toContain("FAKE1");
      expect((thrown as AppError).message).toContain("FAKE2");
    });

    // ─── Business rule: Invalid weights ──────────────────────────────────
    it("should throw AppError(400) with WEIGHTS_INVALID message when weights sum to 90", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Bad Weights",
          stocks: [
            { ticker: "AAPL", percentage: 60 },
            { ticker: "TSLA", percentage: 30 },
          ],
        },
      });
      let thrown: unknown;
      try {
        orderService.splitOrder(req);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(400);
      expect((thrown as AppError).message).toMatch(/weights must sum to 100/);
      expect((thrown as AppError).message).toContain("90.00");
    });

    it("should throw AppError(400) when weights sum to 110", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Over 100",
          stocks: [
            { ticker: "AAPL", percentage: 70 },
            { ticker: "TSLA", percentage: 40 },
          ],
        },
      });
      let thrown: unknown;
      try {
        orderService.splitOrder(req);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(400);
    });

    it("should validate symbols before weights (symbol error takes priority)", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Both bad",
          stocks: [{ ticker: "FAKECOIN", percentage: 50 }],
        },
      });
      let thrown: unknown;
      try {
        orderService.splitOrder(req);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).message).toMatch(/Unknown stock symbol/);
    });

    it("should accept float weights that sum to 100 within tolerance", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Float weights",
          stocks: [
            { ticker: "AAPL", percentage: 33.333 },
            { ticker: "TSLA", percentage: 33.333 },
            { ticker: "MSFT", percentage: 33.334 },
          ],
        },
      });
      const result = orderService.splitOrder(req);
      expect(result.success).toBe(true);
      expect(result.data.legs).toHaveLength(3);
    });
  });

  // ─── getHistoricOrders ────────────────────────────────────────────────────
  describe("getHistoricOrders", () => {
    it("should return success=true with empty array and count 0 when no orders", () => {
      const result = orderService.getHistoricOrders();
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("should return all saved orders with correct count", () => {
      orderService.splitOrder(makeValidRequest());
      orderService.splitOrder(makeValidRequest());
      const result = orderService.getHistoricOrders();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it("should return a copy — mutations do not affect repository", () => {
      orderService.splitOrder(makeValidRequest());
      const result = orderService.getHistoricOrders();
      result.data.pop();
      expect(orderService.getHistoricOrders().count).toBe(1);
    });
  });

  // ─── getOrderById ─────────────────────────────────────────────────────────
  describe("getOrderById", () => {
    it("should return the order matching the given ID", () => {
      const created: Order = orderService.splitOrder(makeValidRequest()).data;
      const found: Order = orderService.getOrderById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.orderType).toBe("BUY");
      expect(found.legs).toHaveLength(2);
    });

    it("should throw AppError(404) with NOT_FOUND message for non-existent ID", () => {
      const id = "NONEXISTENT-ID";
      let thrown: unknown;
      try {
        orderService.getOrderById(id);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(404);
      expect((thrown as AppError).message).toContain(id);
      expect((thrown as AppError).message).toMatch(/not found/i);
    });
  });
});
