import { Service, Inject } from "typedi";
import { OrderRepository } from "../data/OrderRepository";
import {
  buildOrderLegs,
  generateOrderId,
  getNextMarketOpenDate,
  validatePortfolioWeights,
  validateStockSymbols,
  getAvailableStocks,
} from "../helpers/helper";
import { HistoricOrdersResponse, Order, SplitOrderResponse } from "../types";
import { SplitOrderRequestSchema } from "../schemas";
import { AppError } from "../errors/AppError";
import { ERROR_MESSAGES } from "../constants/errorMessages";

@Service()
export class OrderService {
  constructor(
    @Inject() private readonly orderRepository: OrderRepository
  ) {}

  splitOrder(request: SplitOrderRequestSchema): SplitOrderResponse {
    try {
      const { portfolio, totalAmount, orderType } = request;

      const { valid: symbolsValid, invalidSymbols } = validateStockSymbols(portfolio.stocks);
      if (!symbolsValid) {
        const available = Object.keys(getAvailableStocks()).join(", ");
        throw new AppError(ERROR_MESSAGES.ORDER.UNKNOWN_SYMBOLS(invalidSymbols, available), 400);
      }

      const { valid: weightsValid, total } = validatePortfolioWeights(portfolio.stocks);
      if (!weightsValid) {
        throw new AppError(ERROR_MESSAGES.ORDER.WEIGHTS_INVALID(total), 400);
      }

      const order: Order = {
        id: generateOrderId(),
        orderType,
        totalAmount,
        portfolio,
        legs: buildOrderLegs(portfolio.stocks, totalAmount),
        executeAt: getNextMarketOpenDate(),
        createdAt: new Date().toISOString()
      };

      return { success: true, data: this.orderRepository.save(order) };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError(ERROR_MESSAGES.GENERIC.INTERNAL_SERVER_ERROR, 500);
    }
  }

  getHistoricOrders(): HistoricOrdersResponse {
    try {
      const orders: Order[] = this.orderRepository.findAll();
      return { success: true, data: orders, count: orders.length };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError(ERROR_MESSAGES.GENERIC.INTERNAL_SERVER_ERROR, 500);
    }
  }

  getOrderById(id: string): Order {
    try {
      const order: Order | undefined = this.orderRepository.findById(id);
      if (!order) throw new AppError(ERROR_MESSAGES.ORDER.NOT_FOUND(id), 404);
      return order;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError(ERROR_MESSAGES.GENERIC.INTERNAL_SERVER_ERROR, 500);
    }
  }
}
