import { Service } from "typedi";
import { Order } from "../types";

/**
 * OrderRepository
 * In-memory store managed by TypeDI container.
 * No singleton pattern — DI container controls lifecycle.
 */
@Service()
export class OrderRepository {
  private orders: Order[] = [];

  save(order: Order): Order {
    this.orders.push(order);
    return order;
  }

  findAll(): Order[] {
    return [...this.orders];
  }

  findById(id: string): Order | undefined {
    return this.orders.find((o: Order) => o.id === id);
  }

  count(): number {
    return this.orders.length;
  }

  /** Used in tests to reset state between test cases */
  clear(): void {
    this.orders = [];
  }
}
