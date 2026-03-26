import {
  JsonController,
  Post,
  Body,
  HttpCode,
  UseBefore,
} from "routing-controllers";
import { Inject, Service } from "typedi";
import { OpenAPI } from "routing-controllers-openapi";
import { AuthService } from "../services/AuthService";
import { LoginRequestSchema } from "../schemas";
import { LoginResponse } from "../types";
import { loginRateLimiter } from "../middleware/securityMiddleware";

@Service()
@JsonController("/auth")
export class AuthController {
  constructor(
    @Inject() private readonly authService: AuthService
  ) {}

  @Post("/login")
  @HttpCode(200)
  @UseBefore(loginRateLimiter)
  @OpenAPI({
    summary: "Login and get a JWT token",
    description:
      "Accepts username/password and returns a signed JWT. " +
      "Rate limited to 10 attempts per 15 minutes per IP.",
    tags: ["Auth"],
    responses: {
      "200": { description: "Login successful" },
      "400": { description: "Validation error" },
      "401": { description: "Invalid credentials" },
      "429": { description: "Too many login attempts" },
    },
  })
  async login(
    @Body({ validate: true }) body: LoginRequestSchema
  ): Promise<LoginResponse> {
    return this.authService.login(body.username, body.password);
  }
}
