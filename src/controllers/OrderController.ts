import {
  JsonController,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  Authorized,
  CurrentUser,
} from "routing-controllers";
import { Inject, Service } from "typedi";
import { OpenAPI } from "routing-controllers-openapi";
import { OrderService } from "../services/OrderService";
import { SplitOrderRequestSchema } from "../schemas";
import {
  HistoricOrdersResponse,
  JwtPayload,
  SplitOrderResponse,
  Order,
} from "../types";

/**
 * OrderController
 * HTTP layer only — delegates to OrderService, re-throws AppError as-is.
 *
 * @Service() is required here so TypeDI can resolve this controller when
 * routing-controllers calls Container.get(OrderController) at request time.
 * Without it TypeDI throws "Service not found in container".
 */
@Service()
@JsonController("/orders")
@Authorized()
export class OrderController {
  constructor(
    @Inject() private readonly orderService: OrderService
  ) {}

  @Post("/split")
  @HttpCode(201)
  @OpenAPI({
    summary: "Split an order across a model portfolio",
    description:
      "Accepts a model portfolio and total investment amount. " +
      "Returns per-stock breakdown (symbol, amount, shares) and next market execution date.",
    tags: ["Orders"],
    security: [{ bearerAuth: [] }],
    responses: {
      "201": { description: "Order split successfully" },
      "400": { description: "Validation error, unknown ticker, or weights ≠ 100" },
      "401": { description: "Unauthorized — missing or invalid JWT" },
    },
  })
  splitOrder(
    @Body({ validate: true }) body: SplitOrderRequestSchema,
    @CurrentUser() _user: JwtPayload
  ): SplitOrderResponse {
    // AppError thrown by OrderService bubbles up to globalErrorHandler automatically
    return this.orderService.splitOrder(body);
  }

  @Get("/")
  @OpenAPI({
    summary: "Get all historic orders",
    description: "Returns all orders placed in this session. Cleared on restart.",
    tags: ["Orders"],
    security: [{ bearerAuth: [] }],
    responses: {
      "200": { description: "List of historic orders" },
      "401": { description: "Unauthorized" },
    },
  })
  getHistoricOrders(@CurrentUser() _user: JwtPayload): HistoricOrdersResponse {
    return this.orderService.getHistoricOrders();
  }

  @Get("/:id")
  @OpenAPI({
    summary: "Get order by ID",
    description: "Finds and returns a single order by its unique ID.",
    tags: ["Orders"],
    security: [{ bearerAuth: [] }],
    responses: {
      "200": { description: "Order found" },
      "401": { description: "Unauthorized" },
      "404": { description: "Order not found" },
    },
  })
  getOrderById(
    @Param("id") id: string,
    @CurrentUser() _user: JwtPayload
  ): { success: boolean; data: Order } {
    return { success: true, data: this.orderService.getOrderById(id) };
  }
}
