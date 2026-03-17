import { getMetadataArgsStorage } from "routing-controllers";
import { routingControllersToSpec } from "routing-controllers-openapi";
import {
  SplitOrderRequestSchema,
  ModelPortfolioSchema,
  StockHoldingSchema,
  LoginRequestSchema,
} from "../schemas";

/**
 * buildSwaggerSpec
 *
 * routing-controllers-openapi generates $ref pointers like:
 *   $ref: '#/components/schemas/LoginRequestSchema'
 *
 * These refs only resolve if the actual schema objects exist under
 * components.schemas in the spec. We define them manually here using
 * JSON Schema so Swagger UI can render and validate request bodies.
 */
export function buildSwaggerSpec(): object {
  const storage = getMetadataArgsStorage();

  // Inline JSON Schema definitions for every request body class.
  // These match the class-validator decorators in src/schemas/index.ts exactly.
  const schemas: Record<string, object> = {
    LoginRequestSchema: {
      type: "object",
      required: ["username", "password"],
      properties: {
        username: {
          type: "string",
          example: "admin",
        },
        password: {
          type: "string",
          minLength: 4,
          example: "admin123",
        },
      },
    },

    StockHoldingSchema: {
      type: "object",
      required: ["ticker", "percentage"],
      properties: {
        ticker: {
          type: "string",
          example: "AAPL",
          description: "Stock ticker symbol — must exist in stocks.json",
        },
        percentage: {
          type: "number",
          minimum: 0.01,
          maximum: 100,
          example: 60,
          description: "Portfolio weight for this stock (all weights must sum to 100)",
        },
        marketPrice: {
          type: "number",
          minimum: 0.01,
          example: 189.5,
          description: "Optional partner price override. If omitted, uses price from stocks.json ($100)",
        },
      },
    },

    ModelPortfolioSchema: {
      type: "object",
      required: ["name", "stocks"],
      properties: {
        name: {
          type: "string",
          example: "Tech Growth",
        },
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
        portfolio: {
          $ref: "#/components/schemas/ModelPortfolioSchema",
        },
        totalAmount: {
          type: "number",
          minimum: 0.01,
          example: 100,
          description: "Total investment amount in USD to be split across the portfolio",
        },
        orderType: {
          type: "string",
          enum: ["BUY", "SELL"],
          example: "BUY",
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
          "All order endpoints require a Bearer JWT — obtain one from POST /api/auth/login.",
        contact: { name: "API Support" },
      },
      components: {
        schemas,
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      servers: [
        { url: "http://localhost:3000", description: "Local development" },
      ],
    }
  );
}

// Keep unused imports satisfied so TypeScript doesn't complain
// These are referenced indirectly through the schema definitions above
void LoginRequestSchema;
void SplitOrderRequestSchema;
void ModelPortfolioSchema;
void StockHoldingSchema;
