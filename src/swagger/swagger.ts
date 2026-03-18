import { getMetadataArgsStorage } from "routing-controllers";
import { routingControllersToSpec } from "routing-controllers-openapi";
import {
  SplitOrderRequestSchema,
  ModelPortfolioSchema,
  StockHoldingSchema,
  LoginRequestSchema,
} from "../schemas";

export function buildSwaggerSpec(): object {
  const storage = getMetadataArgsStorage();

  const schemas: Record<string, object> = {
    LoginRequestSchema: {
      type: "object",
      required: ["username", "password"],
      properties: {
        username: { type: "string", example: "admin" },
        password: { type: "string", minLength: 4, example: "admin123" },
      },
    },
    StockHoldingSchema: {
      type: "object",
      required: ["ticker", "percentage"],
      properties: {
        ticker: {
          type: "string",
          example: "AAPL",
          description: "Stock ticker — must exist in stocks.json",
        },
        percentage: {
          type: "number",
          minimum: 0.01,
          maximum: 100,
          example: 60,
          description: "Portfolio weight (all weights must sum to 100)",
        },
        marketPrice: {
          type: "number",
          minimum: 0.01,
          example: 189.5,
          description: "Optional price override. Defaults to stocks.json price ($100)",
        },
      },
    },
    ModelPortfolioSchema: {
      type: "object",
      required: ["name", "stocks"],
      properties: {
        name: { type: "string", example: "Tech Growth" },
        stocks: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/components/schemas/StockHoldingSchema" },
        },
      },
    },
    SplitOrderRequestSchema: {
      type: "object",
      required: ["portfolio", "totalAmount", "orderType"],
      properties: {
        portfolio: { $ref: "#/components/schemas/ModelPortfolioSchema" },
        totalAmount: {
          type: "number",
          minimum: 0.01,
          example: 1000,
          description: "Total investment amount (USD) to split across portfolio",
        },
        orderType: { type: "string", enum: ["BUY", "SELL"], example: "BUY" },
      },
    },
    OrderLeg: {
      type: "object",
      properties: {
        ticker: { type: "string", example: "AAPL" },
        percentage: { type: "number", example: 60 },
        shares: {
          type: "number",
          example: 3.166,
          description: "Shares = allocated amount ÷ price, rounded to SHARE_DECIMAL_PLACES",
        },
        amount: {
          type: "number",
          example: 599.96,
          description: "Actual cost = shares × price (reflects rounding, avoids reconciliation gap)",
        },
        price: {
          type: "number",
          example: 189.5,
          description: "Price used: marketPrice override if provided, else stocks.json default",
        },
      },
    },
  };

  return routingControllersToSpec(
    storage,
    { routePrefix: "/api" },
    {
      info: {
        title: "Robo-Advisor Order Splitter API",
        version: "2.0.0",
        description:
          "REST API for splitting investment amounts across model portfolios. " +
          "All order endpoints require a Bearer JWT from POST /api/auth/login.",
        contact: { name: "API Support" },
      },
      components: {
        schemas,
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      servers: [{ url: "http://localhost:3000", description: "Local development" }],
    }
  );
}

void LoginRequestSchema;
void SplitOrderRequestSchema;
void ModelPortfolioSchema;
void StockHoldingSchema;
