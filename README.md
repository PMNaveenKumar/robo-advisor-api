# Robo-Advisor Order Splitter API

Production-grade Node.js + TypeScript REST API using `routing-controllers`, `typedi`, and Swagger.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js + `routing-controllers` |
| Language | TypeScript (strict, decorators enabled) |
| DI Container | `typedi` |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Validation | `class-validator` + `class-transformer` |
| Security | `helmet`, `express-rate-limit`, HTTPS, X-Request-ID |
| CORS | `cors` |
| Swagger | `routing-controllers-openapi` + `swagger-ui-express` |
| Logging | Custom structured JSON logger → daily rotating files |
| Tests | `jest` + `ts-jest` + `supertest` |

---

## Project Structure

```
src/
├── app.ts                          Express factory + server entry
├── config/index.ts                 .env → typed config + config.json
├── constants/errorMessages.ts      All error strings (single source of truth)
├── controllers/
│   ├── AuthController.ts           POST /api/auth/login  (rate limited)
│   └── OrderController.ts          POST /split, GET /, GET /:id
├── data/
│   ├── static.json                 Demo users with bcrypt hashes
│   ├── stocks.json                 Available tickers + default prices
│   └── OrderRepository.ts          In-memory order store (@Service)
├── errors/AppError.ts              Custom error class with statusCode
├── helpers/helper.ts               Pure calculation functions
├── middleware/
│   ├── authMiddleware.ts           authorizationChecker + currentUserChecker
│   ├── errorMiddleware.ts          globalErrorHandler (all errors incl. 404)
│   ├── loggerMiddleware.ts         HTTP request logger using Logger class
│   └── securityMiddleware.ts       loginRateLimiter, requestIdMiddleware, httpsEnforcer
├── schemas/index.ts                class-validator request schemas
├── services/
│   ├── AuthService.ts              JWT login/verify (@Service)
│   └── OrderService.ts             Order business logic (@Service + DI)
├── swagger/swagger.ts              Builds OpenAPI 3.0 spec
├── types/index.ts                  All TypeScript interfaces + Express augmentation
└── utils/logger.ts                 Structured JSON logger with daily rotating files

certs/
├── generate-certs.sh               One-command self-signed cert generator
├── README.md                       SSL setup instructions
├── server.key                      (git-ignored — generate locally)
└── server.cert                     (git-ignored — generate locally)

tests/
├── helpers/helper.test.ts
├── services/AuthService.test.ts
├── services/OrderService.test.ts
├── services/OrderRepository.test.ts
└── controllers/OrderController.test.ts
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start development server (plain HTTP, hot reload)
npm run dev

# 3. Run all tests
npm test
```

Server: `http://localhost:3000`
Swagger UI: `http://localhost:3000/api/docs`

---

## HTTPS Setup (development)

```bash
# Generate self-signed certs (requires openssl)
bash certs/generate-certs.sh

# Set NODE_ENV=production in .env, then:
npm run dev
```

HTTPS server: `https://localhost:3443`
HTTP server: `http://localhost:3000` (redirects to HTTPS)

> Browser will show a security warning for self-signed certs.
> Click **Advanced → Proceed to localhost**.

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HTTPS_PORT` | `3443` | HTTPS port |
| `NODE_ENV` | `development` | `production` enables HTTPS + HSTS |
| `JWT_SECRET` | `your-super-secret...` | **Change in production** |
| `JWT_EXPIRES_IN` | `1h` | Token expiry |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS origins |
| `DEFAULT_STOCK_PRICE` | `100` | Fallback if ticker not in stocks.json |
| `SHARE_DECIMAL_PLACES` | `3` | Share quantity precision |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max login attempts per window per IP |

---

## Logs

Daily rotating log files written to `logs/` at project root:

```
logs/
├── access-YYYY-MM-DD.log   ← all INFO and WARN entries (HTTP requests)
└── error-YYYY-MM-DD.log    ← ERROR entries only
```

Each line is a structured JSON entry:
```json
{"timestamp":"2024-03-17T10:00:01.123Z","level":"INFO","message":"POST /api/auth/login → 200 | 45ms","meta":{"method":"POST","url":"/api/auth/login","status":200,"durationMs":45,"requestId":"a1b2c3d4-..."}}
```

---

## Security Features

| Feature | Implementation |
|---|---|
| **Rate limiting** | `express-rate-limit` on `POST /api/auth/login` — 10 attempts / 15 min / IP |
| **HTTP security headers** | `helmet` — HSTS, CSP, XSS, no-sniff, no-frame |
| **HTTPS** | `https.createServer()` in production; HTTP redirects to HTTPS with 301 |
| **X-Request-ID** | UUID v4 generated per request; echoed in response; included in every log |
| **JWT auth** | Bearer token required on all `/api/orders/*` endpoints |
| **Bcrypt passwords** | Demo users stored with bcrypt hash (rounds=10) in `static.json` |

---

## Sample cURL Requests

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Split Order
```bash
curl -X POST http://localhost:3000/api/orders/split \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "portfolio": {
      "name": "Tech Growth",
      "stocks": [
        { "ticker": "AAPL", "percentage": 60 },
        { "ticker": "TSLA", "percentage": 40 }
      ]
    },
    "totalAmount": 100,
    "orderType": "BUY"
  }'
```

### Get All Orders
```bash
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer <TOKEN>"
```

### Get Order by ID
```bash
curl -X GET http://localhost:3000/api/orders/<ORDER_ID> \
  -H "Authorization: Bearer <TOKEN>"
```
