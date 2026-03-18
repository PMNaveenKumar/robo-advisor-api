// ─── Domain Types ─────────────────────────────────────────────────────────────

export type OrderType = "BUY" | "SELL";

export interface StockHolding {
  ticker: string;
  percentage: number;
  marketPrice?: number;
}

export interface ModelPortfolio {
  name: string;
  stocks: StockHolding[];
}

export interface OrderLeg {
  ticker: string; 
  percentage: number;
  amount: number;
  shares: number;
  price: number;
}

export interface Order {
  id: string;
  orderType: OrderType;
  totalAmount: number;
  portfolio: ModelPortfolio;
  legs: OrderLeg[];
  executeAt: string;
  createdAt: string;
}

// ─── Response Types ───────────────────────────────────────────────────────────

export interface SplitOrderResponse {
  success: boolean;
  data: Order;
}

export interface HistoricOrdersResponse {
  success: boolean;
  data: Order[];
  count: number;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  expiresIn: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: string[];
  statusCode: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  username: string;
  iat?: number;
  exp?: number;
}

export interface StaticUser {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
}

// ─── Express augmentation ─────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}
