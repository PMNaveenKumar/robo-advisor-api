import { Service, Inject } from "typedi";
import { OrderRepository } from "../data/OrderRepository";
import {
  buildOrderLegs,
  generateOrderId,
  validatePortfolioWeights,
  validateStockSymbols,
  getAvailableStocks,
  isMarketOpen,
  getMarketInfo,
} from "../helpers/helper";
import { HistoricOrdersResponse, MarketClosedResponse, Order, SplitOrderResponse } from "../types";
import { SplitOrderRequestSchema } from "../schemas";
import { AppError } from "../errors/AppError";
import { ERROR_MESSAGES } from "../constants/errorMessages";

@Service()
export class OrderService {
  constructor(
    @Inject() private readonly orderRepository: OrderRepository
  ) {}

  splitOrder(request: SplitOrderRequestSchema): SplitOrderResponse | MarketClosedResponse {
    try {
      // Check market status first — return 200 MARKET_CLOSED if outside trading hours
      if (!isMarketOpen()) {
        const marketInfo = getMarketInfo();
        const response: MarketClosedResponse = {
          success:  true,
          status:   "MARKET_CLOSED",
          message:  `Market is currently closed. Next open: ${marketInfo.nextOpenAt}`,
          market: {
            tradingDays:   marketInfo.tradingDays,
            openTime:      marketInfo.openTime,
            closeTime:     marketInfo.closeTime,
            timezone:      marketInfo.timezone,
            currentlyOpen: false,
            nextOpenAt:    marketInfo.nextOpenAt as string,
          },
        };
        return response;
      }

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

      const now = new Date().toISOString();
      const order: Order = {
        id:         generateOrderId(),
        orderType,
        totalAmount,
        portfolio,
        legs:       buildOrderLegs(portfolio.stocks, totalAmount),
        executeAt:  now, // market is open — execute immediately
        createdAt:  now,
      };

      const marketInfo = getMarketInfo();
      return {
        success: true,
        data:    this.orderRepository.save(order),
        market: {
          tradingDays:   marketInfo.tradingDays,
          openTime:      marketInfo.openTime,
          closeTime:     marketInfo.closeTime,
          timezone:      marketInfo.timezone,
          currentlyOpen: true,
          nextOpenAt:    null,
        },
      };
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
