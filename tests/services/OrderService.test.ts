import "reflect-metadata";
import Container from "typedi";
import { OrderService } from "../../src/services/OrderService";
import { OrderRepository } from "../../src/data/OrderRepository";
import { SplitOrderRequestSchema } from "../../src/schemas";
import { AppError } from "../../src/errors/AppError";
import { Order, OrderType, ModelPortfolio } from "../../src/types";

interface RequestOverrides {
  portfolio?: ModelPortfolio;
  totalAmount?: number;
  orderType?: OrderType;
}

function makeValidRequest(overrides: RequestOverrides = {}): SplitOrderRequestSchema {
  const req = new SplitOrderRequestSchema();
  req.portfolio = overrides.portfolio ?? {
    name: "Tech Growth",
    stocks: [
      { ticker: "AAPL", percentage: 60 },
      { ticker: "TSLA", percentage: 40 },
    ],
  };
  req.totalAmount = overrides.totalAmount ?? 100;
  req.orderType = overrides.orderType ?? "BUY";
  return req;
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

  afterEach(() => orderRepository.clear());

  // ─── splitOrder ───────────────────────────────────────────────────────────
  describe("splitOrder", () => {
    it("should return success=true with ORD- id, orderType and totalAmount", () => {
      const result = orderService.splitOrder(makeValidRequest());
      expect(result.success).toBe(true);
      expect(result.data.id).toMatch(/^ORD-/);
      expect(result.data.orderType).toBe("BUY");
      expect(result.data.totalAmount).toBe(100);
    });

    it("should NOT have responseTimeMs on the order", () => {
      const result = orderService.splitOrder(makeValidRequest());
      expect((result.data as unknown as Record<string, unknown>)["responseTimeMs"]).toBeUndefined();
    });

    it("should build legs with ticker, percentage, shares, price, amount", () => {
      const result = orderService.splitOrder(makeValidRequest());
      const { legs } = result.data;
      expect(legs).toHaveLength(2);

      const aapl = legs.find((l) => l.ticker === "AAPL");
      expect(aapl).toBeDefined();
      expect(aapl!.ticker).toBe("AAPL");
      expect(aapl!.percentage).toBe(60);
      expect(aapl!.shares).toBe(0.6);
      expect(aapl!.price).toBe(100);
      expect(aapl!.amount).toBe(60);   // 0.6 × $100 = exact

      const tsla = legs.find((l) => l.ticker === "TSLA");
      expect(tsla!.shares).toBe(0.4);
      expect(tsla!.amount).toBe(40);
    });

    it("amount = shares × price (not raw allocation) when rounding causes a gap", () => {
      // $1000, 60% → allocated $600 at $189.5
      // shares = 3.166, amount = 3.166 × 189.5 = 599.96 (NOT 600)
      const req = makeValidRequest({
        portfolio: {
          name: "Real Price",
          stocks: [
            { ticker: "AAPL", percentage: 60, marketPrice: 189.5 },
            { ticker: "TSLA", percentage: 40, marketPrice: 189.5 },
          ],
        },
        totalAmount: 1000,
      });
      const result = orderService.splitOrder(req);
      const aapl = result.data.legs.find((l) => l.ticker === "AAPL")!;

      expect(aapl.shares).toBe(3.166);
      expect(aapl.amount).toBe(599.957);     // truncate(3.166 × 189.5, 3dp) = 599.957
      expect(aapl.amount).not.toBe(600);     // NOT the raw percentage allocation
    });

    it("should use marketPrice override when provided", () => {
      const req = makeValidRequest({
        portfolio: {
          name: "Custom",
          stocks: [{ ticker: "AAPL", percentage: 100, marketPrice: 200 }],
        },
        totalAmount: 100,
      });
      const result = orderService.splitOrder(req);
      expect(result.data.legs[0].price).toBe(200);
      expect(result.data.legs[0].shares).toBe(0.5);
      expect(result.data.legs[0].amount).toBe(100); // 0.5 × $200 = exact
    });

    it("should handle SELL order type", () => {
      expect(orderService.splitOrder(makeValidRequest({ orderType: "SELL" })).data.orderType).toBe("SELL");
    });

    it("should set executeAt to future weekday at 14:30 UTC", () => {
      const result = orderService.splitOrder(makeValidRequest());
      const d = new Date(result.data.executeAt);
      const day = d.getUTCDay();
      expect(d.getTime()).toBeGreaterThan(Date.now());
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
      expect(d.getUTCHours()).toBe(14);
      expect(d.getUTCMinutes()).toBe(30);
    });

    it("should persist the order in the repository", () => {
      expect(orderRepository.count()).toBe(0);
      orderService.splitOrder(makeValidRequest());
      expect(orderRepository.count()).toBe(1);
    });

    it("should throw AppError(400) for ticker not in stocks.json", () => {
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
      try { orderService.splitOrder(req); } catch (e) { thrown = e; }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(400);
      expect((thrown as AppError).message).toMatch(/Unknown stock symbol/);
      expect((thrown as AppError).message).toContain("FAKECOIN");
    });

    it("should throw AppError(400) when weights do not sum to 100", () => {
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
      try { orderService.splitOrder(req); } catch (e) { thrown = e; }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(400);
      expect((thrown as AppError).message).toMatch(/weights must sum to 100/);
    });

    it("should validate symbols before weights", () => {
      const req = makeValidRequest({
        portfolio: { name: "Both bad", stocks: [{ ticker: "FAKE", percentage: 50 }] },
      });
      let thrown: unknown;
      try { orderService.splitOrder(req); } catch (e) { thrown = e; }
      expect((thrown as AppError).message).toMatch(/Unknown stock symbol/);
    });
  });

  // ─── getHistoricOrders ────────────────────────────────────────────────────
  describe("getHistoricOrders", () => {
    it("should return empty array with count 0", () => {
      const result = orderService.getHistoricOrders();
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("should return all saved orders", () => {
      orderService.splitOrder(makeValidRequest());
      orderService.splitOrder(makeValidRequest());
      const result = orderService.getHistoricOrders();
      expect(result.data).toHaveLength(2);
      expect(result.count).toBe(2);
    });
  });

  // ─── getOrderById ─────────────────────────────────────────────────────────
  describe("getOrderById", () => {
    it("should return the order by ID", () => {
      const created: Order = orderService.splitOrder(makeValidRequest()).data;
      const found: Order = orderService.getOrderById(created.id);
      expect(found.id).toBe(created.id);
    });

    it("should throw AppError(404) for non-existent ID", () => {
      let thrown: unknown;
      try { orderService.getOrderById("NONEXISTENT"); } catch (e) { thrown = e; }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(404);
      expect((thrown as AppError).message).toMatch(/not found/i);
    });
  });
});