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
├── config/index.ts                 .env → typed config (no config.json written to disk)
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
│   ├── authMiddleware.ts           authorizationChecker
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

## HTTPS Setup (production)

```bash
# Generate self-signed certs (requires openssl) | run it in git bash
bash certs/generate-certs.sh

# Update .env file
NODE_ENV=production

# Set NODE_ENV=production in .env, then:
npm run build

# Start the server
npm start
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
| `SHARE_DECIMAL_PLACES` | `3` | Share quantity precision (e.g. 3 → 1.632 shares) |
| `AMOUNT_DECIMAL_PLACES` | `3` | Amount precision (e.g. 3 → 599.957) |
| `MARKET_OPEN_HOUR` | `9` | Market open hour in ET (24h format) |
| `MARKET_OPEN_MINUTE` | `30` | Market open minute in ET |
| `MARKET_CLOSE_HOUR` | `16` | Market close hour in ET (24h format) |
| `MARKET_CLOSE_MINUTE` | `0` | Market close minute in ET |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window for login (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max login attempts per window per IP |

---

## OrderLeg Response Fields

Each leg in the split order response contains:

| Field | Type | Description |
|---|---|---|
| `ticker` | string | Stock ticker symbol (uppercased) |
| `percentage` | number | Portfolio weight for this stock |
| `shares` | number | Number of shares — truncated (not rounded) to `SHARE_DECIMAL_PLACES` |
| `price` | number | Price used: `marketPrice` if provided, else from `stocks.json` |
| `amount` | number | Actual cost = `shares × price`, truncated to `AMOUNT_DECIMAL_PLACES` |

> **Note:** `amount` is computed as `shares × price` after share truncation, not as the raw percentage allocation. This ensures the response reflects the true cost and avoids reconciliation mismatches from rounding.
>
> Example: `$600` allocated, price `$189.5` → `3.166` shares → actual amount `$599.957` (not `$600`).

---

## Share & Amount Calculation

The calculation follows this exact order to ensure amounts never exceed the allocation:

```
1. allocated = totalAmount × (percentage / 100)
               e.g. 1000 × 60% = 600

2. shares    = truncate(allocated ÷ price, SHARE_DECIMAL_PLACES)
               e.g. truncate(600 ÷ 189.5, 3) = truncate(3.16623..., 3) = 3.166

3. amount    = truncate(shares × price, AMOUNT_DECIMAL_PLACES)
               e.g. truncate(3.166 × 189.5, 3) = truncate(599.957, 3) = 599.957
```

Both `SHARE_DECIMAL_PLACES` and `AMOUNT_DECIMAL_PLACES` are configurable in `.env` with no code change required.

---

## Logs

Daily rotating log files written to `logs/` at project root:

```
logs/
├── access-YYYY-MM-DD.log   ← INFO and WARN entries (all HTTP requests)
└── error-YYYY-MM-DD.log    ← ERROR entries only
```

Each line is a structured JSON entry:
```json
{
  "timestamp": "2024-03-17T10:00:01.123Z",
  "level": "INFO",
  "message": "POST /api/auth/login → 200 | 45ms",
  "meta": {
    "method": "POST",
    "url": "/api/auth/login",
    "status": 200,
    "durationMs": 45,
    "requestId": "a1b2c3d4-e5f6-..."
  }
}
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

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "1h"
}
```

---

> For all requests below, replace `<TOKEN>` with the token from the login response.

---

### Split Order — Market Open

When the market is open (Mon–Fri, 09:30–16:00 ET), the order is executed immediately:

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
    "totalAmount": 1000,
    "orderType": "BUY"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "ORD-1710000000000-ABC12",
    "orderType": "BUY",
    "totalAmount": 1000,
    "legs": [
      { "ticker": "AAPL", "percentage": 60, "shares": 6, "price": 100, "amount": 600 },
      { "ticker": "TSLA", "percentage": 40, "shares": 4, "price": 100, "amount": 400 }
    ],
    "executeAt": "2024-03-17T14:32:00.000Z",
    "createdAt": "2024-03-17T14:32:00.000Z"
  },
  "market": {
    "tradingDays": "Monday to Friday",
    "openTime": "09:30 ET (EDT UTC-4)",
    "closeTime": "16:00 ET (EDT UTC-4)",
    "timezone": "America/New_York",
    "currentlyOpen": true
  }
}
```

---

### Split Order — Market Closed

When the market is closed (outside Mon–Fri 09:30–16:00 ET), the order is **not created**. The API returns `200` with a `MARKET_CLOSED` status and the next market open time:

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
    "totalAmount": 1000,
    "orderType": "BUY"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "status": "MARKET_CLOSED",
  "message": "Market is currently closed.",
  "market": {
    "tradingDays": "Monday to Friday",
    "openTime": "09:30 ET (EDT UTC-4)",
    "closeTime": "16:00 ET (EDT UTC-4)",
    "timezone": "America/New_York",
    "currentlyOpen": false
  }
}
```

> **Note:** No order is created when the market is closed.

---

### Split Order — With Market Price Override

```bash
curl -X POST http://localhost:3000/api/orders/split \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "portfolio": {
      "name": "Real Prices",
      "stocks": [
        { "ticker": "AAPL", "percentage": 60, "marketPrice": 189.5 },
        { "ticker": "TSLA", "percentage": 40, "marketPrice": 245.00 }
      ]
    },
    "totalAmount": 1000,
    "orderType": "BUY"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "ORD-1710000000001-XYZ99",
    "orderType": "BUY",
    "totalAmount": 1000,
    "legs": [
      { "ticker": "AAPL", "percentage": 60, "shares": 3.166, "price": 189.5, "amount": 599.957 },
      { "ticker": "TSLA", "percentage": 40, "shares": 1.632, "price": 245, "amount": 399.84 }
    ],
    "executeAt": "2024-03-17T14:32:00.000Z",
    "createdAt": "2024-03-17T14:32:00.000Z"
  },
  "market": {
    "tradingDays": "Monday to Friday",
    "openTime": "09:30 ET (EDT UTC-4)",
    "closeTime": "16:00 ET (EDT UTC-4)",
    "timezone": "America/New_York",
    "currentlyOpen": true
  }
}
```

---

### Get All Orders
```bash
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    { "id": "ORD-...", "orderType": "BUY", "totalAmount": 1000, "legs": [...] },
    { "id": "ORD-...", "orderType": "SELL", "totalAmount": 500, "legs": [...] }
  ]
}
```

---

### Get Order by ID
```bash
curl -X GET http://localhost:3000/api/orders/<ORDER_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "ORD-1710000000000-ABC12",
    "orderType": "BUY",
    "totalAmount": 1000,
    "legs": [
      { "ticker": "AAPL", "percentage": 60, "shares": 6, "price": 100, "amount": 600 },
      { "ticker": "TSLA", "percentage": 40, "shares": 4, "price": 100, "amount": 400 }
    ],
    "executeAt": "2024-03-17T14:32:00.000Z",
    "createdAt": "2024-03-17T14:32:00.000Z"
  }
}
```

**Error — Not Found (404):**
```json
{
  "success": false,
  "message": "Order with ID 'ORD-INVALID' not found",
  "statusCode": 404
}
```

---

### Error Responses

**Invalid credentials (401):**
```json
{
  "success": false,
  "message": "Invalid credentials",
  "statusCode": 401
}
```

**Unknown ticker (400):**
```json
{
  "success": false,
  "message": "Unknown stock symbol(s): FAKECOIN. Available stocks: AAPL, TSLA, MSFT, AMZN, GOOGL, META, NVDA, NFLX",
  "statusCode": 400
}
```

**Portfolio weights not 100 (400):**
```json
{
  "success": false,
  "message": "Portfolio weights must sum to 100. Current sum: 90.00",
  "statusCode": 400
}
```

**Validation error (400):**
```json
{
  "success": false,
  "message": "totalAmount must be greater than 0",
  "errors": ["totalAmount must be greater than 0"],
  "statusCode": 400
}
```

**No token (401):**
```json
{
  "success": false,
  "message": "Unauthorized: Missing or malformed Authorization header. Expected: Bearer <token>",
  "statusCode": 401
}
```