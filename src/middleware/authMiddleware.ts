import { Action } from "routing-controllers";
import Container from "typedi";
import { AuthService } from "../services/AuthService";
import { JwtPayload } from "../types";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { logger } from "./loggerMiddleware";

/**
 * authorizationChecker
 * Validates the Bearer JWT from the Authorization header.
 * Returns false → routing-controllers automatically sends 401.
 */
export async function authorizationChecker(action: Action): Promise<boolean> {
  try {
    const authHeader: string | undefined =
      action.request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn(ERROR_MESSAGES.AUTH.MISSING_TOKEN, {
        requestId: action.request.requestId,
        ip: action.request.ip,
      });
      return false;
    }

    const token: string = authHeader.split(" ")[1];
    const authService: AuthService = Container.get(AuthService);
    const payload: JwtPayload = authService.verifyToken(token);

    action.request.user = payload;
    return true;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : ERROR_MESSAGES.AUTH.INVALID_TOKEN;
    logger.warn(`Token verification failed: ${message}`, {
      requestId: action.request.requestId,
      ip: action.request.ip,
    });
    return false;
  }
}

/**
 * currentUserChecker
 * Returns the decoded JWT payload attached by authorizationChecker.
 */
export function currentUserChecker(action: Action): JwtPayload | undefined {
  return action.request.user as JwtPayload | undefined;
}
