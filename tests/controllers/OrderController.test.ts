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
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
  authToken = res.body.token as string;
});

beforeEach(() => {
  Container.get(OrderRepository).clear();
});

// ─── GET /health ──────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("should return 200 with status OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("should return 200 with JWT for valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.token.split(".")).toHaveLength(3);
    expect(res.body.expiresIn).toBe("1h");
  });

  it("should return 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should return 401 for unknown username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "admin123" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should return error status when password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── POST /api/orders/split ───────────────────────────────────────────────────

describe("POST /api/orders/split", () => {
  it("should return 201 with ticker, shares, price, amount in legs", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validSplitBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toMatch(/^ORD-/);

    const aapl = res.body.data.legs.find((l: { ticker: string }) => l.ticker === "AAPL");
    const tsla = res.body.data.legs.find((l: { ticker: string }) => l.ticker === "TSLA");

    // field names
    expect(aapl.ticker).toBe("AAPL");       // renamed from symbol
    expect(aapl.price).toBe(100);            // renamed from priceUsed
    expect(aapl.shares).toBe(0.6);
    expect(aapl.amount).toBe(60);            // 0.6 × $100 = exact

    expect(tsla.ticker).toBe("TSLA");
    expect(tsla.shares).toBe(0.4);
    expect(tsla.amount).toBe(40);
  });

  it("should NOT include responseTimeMs in the response", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validSplitBody);
    expect(res.status).toBe(201);
    expect(res.body.data.responseTimeMs).toBeUndefined();
  });

  it("amount = shares × price — not raw allocation when price causes rounding", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        portfolio: {
          name: "Real Prices",
          stocks: [
            { ticker: "AAPL", percentage: 60, marketPrice: 189.5 },
            { ticker: "TSLA", percentage: 40, marketPrice: 189.5 },
          ],
        },
        totalAmount: 1000,
        orderType: "BUY",
      });

    expect(res.status).toBe(201);
    const aapl = res.body.data.legs.find((l: { ticker: string }) => l.ticker === "AAPL");

    expect(aapl.shares).toBe(3.166);
    expect(aapl.amount).toBe(599.957);    // truncate(3.166 × 189.5, 3dp) = 599.957
    expect(aapl.amount).not.toBe(600);   // NOT the raw $600 allocation
    expect(aapl.price).toBe(189.5);  });

  it("should use marketPrice when provided", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        portfolio: {
          name: "Custom",
          stocks: [{ ticker: "AAPL", percentage: 100, marketPrice: 200 }],
        },
        totalAmount: 100,
        orderType: "BUY",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.legs[0].price).toBe(200);
    expect(res.body.data.legs[0].shares).toBe(0.5);
    expect(res.body.data.legs[0].amount).toBe(100);
  });

  it("should return 201 for SELL order type", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, orderType: "SELL" });
    expect(res.status).toBe(201);
    expect(res.body.data.orderType).toBe("SELL");
  });

  it("should return 400 with message for unknown ticker", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        portfolio: {
          name: "Bad",
          stocks: [
            { ticker: "AAPL", percentage: 60 },
            { ticker: "FAKECOIN", percentage: 40 },
          ],
        },
        totalAmount: 100,
        orderType: "BUY",
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Unknown stock symbol/);
    expect(res.body.message).toContain("FAKECOIN");
  });

  it("should return 400 when weights do not sum to 100", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        portfolio: {
          name: "Bad Weights",
          stocks: [
            { ticker: "AAPL", percentage: 60 },
            { ticker: "TSLA", percentage: 30 },
          ],
        },
        totalAmount: 100,
        orderType: "BUY",
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/weights must sum to 100/);
  });

  it("should return error status for invalid orderType with descriptive message", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, orderType: "HOLD" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    // Should contain a descriptive message, not the generic routing-controllers one
    expect(res.body.message).not.toBe("Invalid body, check 'errors' property for more info.");
  });

  it("should return 400 with descriptive message when totalAmount is 0", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, totalAmount: 0 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message).not.toBe("Invalid body, check 'errors' property for more info.");
    expect(res.body.message).toMatch(/totalAmount/);
  });

  it("should return 400 with descriptive message when totalAmount is null", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, totalAmount: null });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message).not.toBe("Invalid body, check 'errors' property for more info.");
  });

  it("should return 400 with descriptive message when stocks array is empty", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validSplitBody, portfolio: { name: "Empty", stocks: [] } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message).not.toBe("Invalid body, check 'errors' property for more info.");
  });

  it("should return 401 without Authorization header", async () => {
    const res = await request(app).post("/api/orders/split").send(validSplitBody);
    expect(res.status).toBe(401);
  });

  it("should return 401 with an invalid token", async () => {
    const res = await request(app)
      .post("/api/orders/split")
      .set("Authorization", "Bearer this.is.invalid")
      .send(validSplitBody);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/orders ──────────────────────────────────────────────────────────

describe("GET /api/orders", () => {
  it("should return empty list when no orders", async () => {
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

  it("should return 401 without Authorization header", async () => {
    expect((await request(app).get("/api/orders")).status).toBe(401);
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

describe("GET /api/orders/:id", () => {
  it("should return the order for a valid ID", async () => {
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
    expect(res.body.data.responseTimeMs).toBeUndefined();
  });

  it("should return 404 with message for non-existent ID", async () => {
    const res = await request(app)
      .get("/api/orders/NON-EXISTENT-ID")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("should return 401 without Authorization header", async () => {
    expect((await request(app).get("/api/orders/some-id")).status).toBe(401);
  });
});
