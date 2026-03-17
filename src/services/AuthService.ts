import { Service } from "typedi";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import config from "../config";
import staticData from "../data/static.json";
import { JwtPayload, LoginResponse, StaticUser } from "../types";
import { AppError } from "../errors/AppError";
import { ERROR_MESSAGES } from "../constants/errorMessages";

@Service()
export class AuthService {
  private readonly users: StaticUser[] = staticData.users as StaticUser[];

  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const user: StaticUser | undefined = this.users.find(
        (u: StaticUser) => u.username === username
      );

      if (!user) {
        throw new AppError(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS, 401);
      }

      const isValid: boolean = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new AppError(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS, 401);
      }

      const payload: JwtPayload = { username: user.username };
      const token: string = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"],
      });

      return { success: true, token, expiresIn: config.jwt.expiresIn };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError(ERROR_MESSAGES.GENERIC.INTERNAL_SERVER_ERROR, 500);
    }
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch {
      throw new AppError(ERROR_MESSAGES.AUTH.INVALID_TOKEN, 401);
    }
  }
}
