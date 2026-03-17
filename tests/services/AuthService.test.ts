import "reflect-metadata";
import { AuthService } from "../../src/services/AuthService";
import { AppError } from "../../src/errors/AppError";
import { ERROR_MESSAGES } from "../../src/constants/errorMessages";

/**
 * AuthService Unit Tests
 * AuthService has no injected dependencies — create directly with new AuthService().
 * Never call Container.reset() here — it corrupts TypeDI state for other suites.
 */
describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  // ─── login ────────────────────────────────────────────────────────────────
  describe("login", () => {
    it("should return success=true with a 3-part JWT for valid credentials", async () => {
      const result = await authService.login("admin", "admin123");

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      expect(result.token.split(".")).toHaveLength(3);
      expect(result.expiresIn).toBe("1h");
    });

    it("should throw AppError(401) with 'Invalid credentials' for unknown username", async () => {
      let thrown: unknown;
      try {
        await authService.login("unknown", "admin123");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
      expect((thrown as AppError).message).toBe(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    });

    it("should throw AppError(401) with 'Invalid credentials' for wrong password", async () => {
      let thrown: unknown;
      try {
        await authService.login("admin", "wrongpassword");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
      expect((thrown as AppError).message).toBe(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    });

    it("should throw AppError(401) for empty username", async () => {
      let thrown: unknown;
      try {
        await authService.login("", "admin123");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
    });

    it("should throw AppError(401) for empty password", async () => {
      let thrown: unknown;
      try {
        await authService.login("admin", "");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
    });
  });

  // ─── verifyToken ──────────────────────────────────────────────────────────
  describe("verifyToken", () => {
    it("should return payload with correct username for a valid token", async () => {
      const { token } = await authService.login("admin", "admin123");
      const payload = authService.verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.username).toBe("admin");
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it("should throw AppError(401) for an invalid token", () => {
      let thrown: unknown;
      try {
        authService.verifyToken("invalid.token.here");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
      expect((thrown as AppError).message).toBe(ERROR_MESSAGES.AUTH.INVALID_TOKEN);
    });

    it("should throw AppError(401) for an empty token", () => {
      let thrown: unknown;
      try {
        authService.verifyToken("");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
    });

    it("should throw AppError(401) for a tampered token", async () => {
      const { token } = await authService.login("admin", "admin123");
      const tampered = token.slice(0, -5) + "XXXXX";
      let thrown: unknown;
      try {
        authService.verifyToken(tampered);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).statusCode).toBe(401);
    });
  });
});
