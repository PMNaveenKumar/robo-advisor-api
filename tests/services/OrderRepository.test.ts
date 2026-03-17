import "reflect-metadata";
import { OrderRepository } from "../../src/data/OrderRepository";
import { Order } from "../../src/types";

function makeOrder(id: string, orderType: "BUY" | "SELL" = "BUY"): Order {
  return {
    id,
    orderType,
    totalAmount: 100,
    portfolio: {
      name: "Test Portfolio",
      stocks: [{ ticker: "AAPL", percentage: 100 }],
    },
    legs: [
      {
        symbol: "AAPL",
        percentage: 100,
        amount: 100,
        shares: 1,
        priceUsed: 100,
      },
    ],
    executeAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    responseTimeMs: 0,
  };
}

describe("OrderRepository", () => {
  let repo: OrderRepository;

  beforeEach(() => {
    repo = new OrderRepository();
  });

  it("should start with count 0 and empty array", () => {
    expect(repo.count()).toBe(0);
    expect(repo.findAll()).toEqual([]);
  });

  it("should save an order and reflect count of 1", () => {
    const saved = repo.save(makeOrder("ORD-001"));
    expect(saved.id).toBe("ORD-001");
    expect(repo.count()).toBe(1);
  });

  it("should return a shallow copy from findAll — external mutations do not affect store", () => {
    repo.save(makeOrder("ORD-001"));
    const result = repo.findAll();
    result.push(makeOrder("ORD-EXTRA"));
    expect(repo.count()).toBe(1);
  });

  it("should find an order by ID", () => {
    repo.save(makeOrder("ORD-001"));
    repo.save(makeOrder("ORD-002"));
    const found = repo.findById("ORD-002");
    expect(found).toBeDefined();
    expect(found!.id).toBe("ORD-002");
  });

  it("should return undefined for a non-existent ID", () => {
    repo.save(makeOrder("ORD-001"));
    expect(repo.findById("GHOST-ID")).toBeUndefined();
  });

  it("should clear all orders", () => {
    repo.save(makeOrder("ORD-001"));
    repo.save(makeOrder("ORD-002"));
    repo.clear();
    expect(repo.count()).toBe(0);
    expect(repo.findAll()).toEqual([]);
  });

  it("should maintain insertion order in findAll", () => {
    repo.save(makeOrder("ORD-001"));
    repo.save(makeOrder("ORD-002"));
    repo.save(makeOrder("ORD-003"));
    const all = repo.findAll();
    expect(all[0].id).toBe("ORD-001");
    expect(all[1].id).toBe("ORD-002");
    expect(all[2].id).toBe("ORD-003");
  });

  it("should store BUY and SELL order types correctly", () => {
    repo.save(makeOrder("ORD-BUY", "BUY"));
    repo.save(makeOrder("ORD-SELL", "SELL"));
    expect(repo.findById("ORD-BUY")!.orderType).toBe("BUY");
    expect(repo.findById("ORD-SELL")!.orderType).toBe("SELL");
  });

  it("should support saving 10 orders and count them correctly", () => {
    for (let i = 1; i <= 10; i++) {
      repo.save(makeOrder(`ORD-${String(i).padStart(3, "0")}`));
    }
    expect(repo.count()).toBe(10);
    expect(repo.findAll()).toHaveLength(10);
  });
});
