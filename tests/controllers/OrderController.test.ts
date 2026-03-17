import "reflect-metadata";
import request from "supertest";
import Container from "typedi";
import { createApp } from "../../src/app";
import { OrderRepository } from "../../src/data/OrderRepository";
import { Application } from "express";

let app: Application;
let authToken: string;

const validSplitBody = {
  portfolio: {
    name: "Tech Growth",
    stocks: [
      { ticker: "AAPL", percentage: 60 },
      { ticker: "TSLA", percentage: 40 },
    ],
  },
  totalAmount: 100,
  orderType: "BUY",
};

beforeAll(async () => {
  app = createApp();
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
  authToken = loginRes.body.token as string;
});

beforeEach(() => {
  Container.get(OrderRepository).clear();
});

// ─── POST /api/orders/split ───────────────────────────────────────────────────

describe("POST /api/orders/split", () => {
  it("should return 201 with symbol, amount, shares in legs", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validSplitBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const legs = res.body.data.legs;
    const aapl = legs.find((l: { symbol: string }) => l.symbol === "AAPL");
    const tsla = legs.find((l: { symbol: string }) => l.symbol === "TSLA");

    expect(aapl).toBeDefined();
    expect(aapl.symbol).toBe("AAPL");
    expect(aapl.amount).toBe(60);
    expect(aapl.shares).toBe(0.6);

    expect(tsla).toBeDefined();
    expect(tsla.symbol).toBe("TSLA");
    expect(tsla.amount).toBe(40);
    expect(tsla.shares).toBe(0.4);
  });

  it("should use price from stocks.json for known tickers", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validSplitBody);

    expect(res.status).toBe(201);
    expect(res.body.data.legs[0].priceUsed).toBe(100);
  });

  it("should use marketPrice override when provided", async () => {
    const body = {
      portfolio: {
        name: "Custom",
        stocks: [{ ticker: "AAPL", percentage: 100, marketPrice: 200 }],
      },
      totalAmount: 100,
      orderType: "BUY",
    };
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.legs[0].priceUsed).toBe(200);
    expect(res.body.data.legs[0].shares).toBe(0.5);
  });

  it("should return 400 for a ticker not in stocks.json", async () => {
    const body = {
      portfolio: {
        name: "Bad",
        stocks: [
          { ticker: "AAPL", percentage: 60 },
          { ticker: "FAKECOIN", percentage: 40 },
        ],
      },
      totalAmount: 100,
      orderType: "BUY",
    };
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unknown stock symbol/);
  });

  it("should return 400 when weights do not sum to 100", async () => {
    const body = {
      portfolio: {
        name: "Bad Weights",
        stocks: [
          { ticker: "AAPL", percentage: 60 },
          { ticker: "TSLA", percentage: 30 },
        ],
      },
      totalAmount: 100,
      orderType: "BUY",
    };
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it("should handle SELL order type", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, orderType: "SELL" });

    expect(res.status).toBe(201);
    expect(res.body.data.orderType).toBe("SELL");
  });

  it("should return 400 when orderType is invalid", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, orderType: "HOLD" });

    expect(res.status).toBe(400);
  });

  it("should return 400 when stocks array is empty", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, portfolio: { name: "Empty", stocks: [] } });

    expect(res.status).toBe(400);
  });

  it("should return 401 without a token", async () => {
    const res = await request(app).post("/api/orders/split").send(validSplitBody);
    expect(res.status).toBe(401);
  });

  it("should return 401 with an invalid token", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", "Bearer invalid.token.here")
      .send(validSplitBody);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/orders ──────────────────────────────────────────────────────────

describe("GET /api/orders", () => {
  it("should return empty list when no orders exist", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("should return all placed orders", async () => {
    await request(app).post("/api/orders/split").set("Authorization", `Bearer ${authToken}`).send(validSplitBody);
    await request(app).post("/api/orders/split").set("Authorization", `Bearer ${authToken}`).send(validSplitBody);

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });

  it("should return 401 without a token", async () => {
    expect((await request(app).get("/api/orders")).status).toBe(401);
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

describe("GET /api/orders/:id", () => {
  it("should return a single order by ID", async () => {
    const created = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validSplitBody);

    const orderId: string = created.body.data.id as string;

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(orderId);
  });

  it("should return 404 for a non-existent order ID", async () => {
    const res = await request(app)
      .get("/api/orders/NON-EXISTENT")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("should return a token for valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    expect(res.status).toBe(200);
    expect(res.body.token.split(".")).toHaveLength(3);
  });

  it("should return 401 for invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("should return 400 for missing password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin" });
    expect(res.status).toBe(400);
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("should return 200 with status OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });
});
