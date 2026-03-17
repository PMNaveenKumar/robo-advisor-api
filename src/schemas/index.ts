import "reflect-metadata";
import {
  IsString, IsNumber, IsPositive, IsIn, IsArray,
  ValidateNested, IsOptional, Min, Max, ArrayMinSize,
  IsNotEmpty, MinLength,
} from "class-validator";
import { Type } from "class-transformer";

// ─── Stock Holding ────────────────────────────────────────────────────────────

export class StockHoldingSchema {
  @IsString()
  @IsNotEmpty({ message: "Ticker symbol is required" })
  ticker!: string;

  @IsNumber({}, { message: "Percentage must be a number" })
  @Min(0.01, { message: "Percentage must be greater than 0" })
  @Max(100, { message: "Percentage cannot exceed 100" })
  percentage!: number;

  @IsOptional()
  @IsNumber({}, { message: "Market price must be a number" })
  @IsPositive({ message: "Market price must be positive" })
  marketPrice?: number;
}

// ─── Model Portfolio ──────────────────────────────────────────────────────────

export class ModelPortfolioSchema {
  @IsString()
  @IsNotEmpty({ message: "Portfolio name is required" })
  name!: string;

  @IsArray({ message: "Stocks must be an array" })
  @ArrayMinSize(1, { message: "Portfolio must contain at least one stock" })
  @ValidateNested({ each: true })
  @Type(() => StockHoldingSchema)
  stocks!: StockHoldingSchema[];
}

// ─── Split Order Request ──────────────────────────────────────────────────────

export class SplitOrderRequestSchema {
  @ValidateNested()
  @Type(() => ModelPortfolioSchema)
  portfolio!: ModelPortfolioSchema;

  @IsNumber({}, { message: "Total amount must be a number" })
  @IsPositive({ message: "Total amount must be positive" })
  totalAmount!: number;

  @IsIn(["BUY", "SELL"], { message: "orderType must be BUY or SELL" })
  orderType!: "BUY" | "SELL";
}

// ─── Login Request ────────────────────────────────────────────────────────────

export class LoginRequestSchema {
  @IsString()
  @IsNotEmpty({ message: "Username is required" })
  username!: string;

  @IsString()
  @MinLength(4, { message: "Password must be at least 4 characters" })
  password!: string;
}
