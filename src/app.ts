import "reflect-metadata";
import "dotenv/config";
import express, { Application, Request, Response, NextFunction } from "express";
import https from "https";
import http from "http";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { useExpressServer, useContainer } from "routing-controllers";
import { Container } from "typedi";

import config from "./config";
import { AuthController } from "./controllers/AuthController";
import { OrderController } from "./controllers/OrderController";
import { authorizationChecker, currentUserChecker } from "./middleware/authMiddleware";
import { loggerMiddleware, logger } from "./middleware/loggerMiddleware";
import { globalErrorHandler } from "./middleware/errorMiddleware";
import { requestIdMiddleware, httpsEnforcer } from "./middleware/securityMiddleware";
import { AppError } from "./errors/AppError";
import { ERROR_MESSAGES } from "./constants/errorMessages";
import { buildSwaggerSpec } from "./swagger/swagger";

useContainer(Container);

export function createApp(): Application {
  const app: Application = express();

  // ─── 1. Request ID ────────────────────────────────────────────────────────
  // Must be FIRST — attaches req.requestId so every subsequent log includes it
  app.use(requestIdMiddleware);

  // ─── 2. HTTPS enforcer (production only) ─────────────────────────────────
  // 301 redirects plain HTTP → HTTPS. No-op in development.
  app.use(httpsEnforcer);

  // ─── 3. Helmet — HTTP security headers ───────────────────────────────────
  // HSTS, X-Content-Type-Options, X-Frame-Options, XSS protection, CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // needed for Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'"],  // needed for Swagger UI
          imgSrc: ["'self'", "data:"],
        },
      },
      // HSTS in production only — self-signed certs break it in dev
      hsts: config.server.isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    })
  );

  // ─── 4. CORS ──────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void
      ) => {
        if (!origin && !config.server.isProduction) return callback(null, true);
        if (!origin || config.cors.allowedOrigins.includes(origin))
          return callback(null, true);
        callback(new Error(`CORS: Origin '${origin}' not allowed`));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      exposedHeaders: ["X-Request-ID"],
      credentials: true,
    })
  );

  // ─── 5. Body parsing + request logger ────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(loggerMiddleware);

  // ─── 6. Health check ──────────────────────────────────────────────────────
  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      status: "OK",
      timestamp: new Date().toISOString(),
      environment: config.server.nodeEnv,
      requestId: req.requestId,
    });
  });

  // ─── 7. Swagger UI ────────────────────────────────────────────────────────
  const swaggerSpec = buildSwaggerSpec();
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (_req: Request, res: Response) =>
    res.json(swaggerSpec)
  );

  // ─── 8. routing-controllers (all API routes) ──────────────────────────────
  useExpressServer(app, {
    routePrefix: "/api",
    controllers: [AuthController, OrderController],
    validation: { whitelist: true, forbidNonWhitelisted: false },
    classTransformer: true,
    defaultErrorHandler: false, // our globalErrorHandler handles all errors including AppError
    authorizationChecker,
    currentUserChecker,
  });

  // ─── 9. 404 catch-all ─────────────────────────────────────────────────────
  // Guard with headersSent: routing-controllers calls next() after every
  // successful response, which would otherwise trigger a false 404.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next();
    next(
      new AppError(
        ERROR_MESSAGES.GENERIC.NOT_FOUND(req.method, req.originalUrl),
        404
      )
    );
  });

  // ─── 10. Global error handler (must be last — 4 params) ──────────────────
  app.use(globalErrorHandler);

  return app;
}

// ─── Server Entry Point ───────────────────────────────────────────────────────

if (require.main === module) {
  const app = createApp();

  if (config.server.isProduction) {
    // ── Production: HTTP redirect server + HTTPS main server ─────────────
    if (!fs.existsSync(config.ssl.keyPath) || !fs.existsSync(config.ssl.certPath)) {
      logger.error("SSL certificates not found. Run: bash certs/generate-certs.sh");
      process.exit(1);
    }

    const sslOptions = {
      key: fs.readFileSync(config.ssl.keyPath),
      cert: fs.readFileSync(config.ssl.certPath),
    };

    // HTTP → redirects only
    http.createServer(app).listen(config.server.port, () => {
      logger.info(`🔀  HTTP  (redirect) → http://localhost:${config.server.port}`);
    });

    // HTTPS → handles all real traffic
    https.createServer(sslOptions, app).listen(config.server.httpsPort, () => {
      logger.info(`🔒  HTTPS → https://localhost:${config.server.httpsPort}`);
      logger.info(`📋  Swagger UI → https://localhost:${config.server.httpsPort}/api/docs`);
    });

  } else {
    // ── Development: plain HTTP ───────────────────────────────────────────
    app.listen(config.server.port, () => {
      logger.info(`🚀  Robo-Advisor API  →  http://localhost:${config.server.port}`);
      logger.info(`📋  Swagger UI        →  http://localhost:${config.server.port}/api/docs`);
      logger.info(`🔑  Login             →  POST http://localhost:${config.server.port}/api/auth/login`);
      logger.info(`📊  Split Order       →  POST http://localhost:${config.server.port}/api/orders/split`);
      logger.info(`📜  History           →  GET  http://localhost:${config.server.port}/api/orders`);
    });
  }
}

export default createApp;
