# ANSWERS

---

## 1. What was your approach (thought process) to tackling this project?

My first step was to fully read and understand the problem before writing any code. The core requirement is an **order splitter** — a system that takes a model portfolio and a total investment amount, then returns a per-stock breakdown of how much to buy or sell and when to execute.

I broke the work into four distinct layers and built them in order:

**Domain modelling first.** Before any logic, I defined all TypeScript interfaces in `src/types/index.ts` — `Order`, `OrderLeg`, `StockHolding`, `ModelPortfolio`. Having the shape of data defined upfront meant every subsequent file had a contract to work against.

**Pure business logic second.** I isolated all calculations into stateless functions in `src/helpers/helper.ts` — amount splitting, share quantity rounding, portfolio weight validation, stock symbol validation, and market date scheduling. Pure functions are trivially testable and have no side effects.

**Services third.** `OrderService` and `AuthService` contain the business rules (validate symbols, validate weights, build the order, persist it). They throw `AppError` with an HTTP status code so the error carries its own response context without the service needing to know about HTTP.

**HTTP layer last.** Controllers are thin — they receive a validated request body, call the service, and return the result. All routing is declared via `routing-controllers` decorators (`@JsonController`, `@Post`, `@Get`, `@Authorized`, `@Body`) so there are no separate route files.

Dependency injection via `typedi` meant each class receives its dependencies through the constructor rather than creating them internally, keeping everything loosely coupled and easy to test.

---

## 2. What assumptions did you make?

**Stock prices.** The requirement states a fixed price of $100 per share. I implemented this via `src/data/stocks.json` where every ticker maps to a default price of `100`. If the partner passes a `marketPrice` field on any stock, that value takes priority over the stocks.json price. The fallback chain is: `marketPrice` → `stocks.json` → `DEFAULT_STOCK_PRICE` from `.env`.

**Available tickers.** The requirement does not specify which stocks are valid, so I created `stocks.json` as the single source of truth for accepted tickers. Any ticker not in this file is rejected with a descriptive error listing valid options. Adding a new stock requires only a JSON edit — no code change.

**Portfolio weight validation.** All percentage values in a portfolio must sum to exactly 100. I applied a floating-point tolerance of ±0.001 to avoid rejecting valid inputs like `33.333 + 33.333 + 33.334 = 100`.

**Market execution schedule.** "When to execute" means the next weekday market open at 9:30 AM ET (14:30 UTC). If an order is placed on Friday, Saturday, or Sunday, it schedules for Monday. The system does not account for public holidays.

**Data persistence.** Orders are stored in an in-memory array inside `OrderRepository`. The requirement explicitly states data should not survive application restart, so no database was used.

**Decimal precision.** Share quantities default to 3 decimal places, controlled by `SHARE_DECIMAL_PLACES` in `.env`. This can be changed to any value (e.g. 7) with a restart and no code change.

**Authentication.** The API uses JWT-based authentication. Demo credentials are stored as bcrypt hashes in `src/data/static.json`. In production these would live in a database and secrets manager.

---

## 3. What challenges did you face when creating your solution?

**routing-controllers and TypeDI wiring.** Getting `routing-controllers` to resolve controllers through the TypeDI container required `useContainer(Container)` to be called before `useExpressServer()`, and `@Service()` to be present on both controllers and services. Missing either caused a `ServiceNotFoundError` at runtime. The correct mental model is that routing-controllers asks TypeDI to instantiate every controller on each request — so TypeDI must have a registration for it.

**Nodemon infinite restart loop.** `src/config/index.ts` wrote `config.json` inside the `src/` folder on every startup. Nodemon watches `src/**`, detects the new file, restarts the server, which writes the file again — an infinite loop. The fix was to write `config.json` to the project root (outside `src/`) and add a `nodemon.json` with an explicit ignore list.

**Cannot set headers after they are sent.** Two separate issues caused this. First, `loggerMiddleware` called `res.setHeader()` inside `res.on("finish")` — but `finish` fires after the response is already sent, so headers are locked. The fix was to remove `setHeader` from the finish callback entirely and use it only for console/file logging. Second, the 404 catch-all handler was logging false errors because routing-controllers calls `next()` after every successfully handled route, which caused Express to walk down to the 404 handler even on successful responses. The fix was to guard the handler with `if (res.headersSent) return next()`.

**Swagger $ref resolution errors.** `routing-controllers-openapi` generates `$ref` pointers like `#/components/schemas/LoginRequestSchema` but does not populate the `components.schemas` section automatically. Swagger UI showed resolver errors because the referenced schemas did not exist in the spec. The fix was to manually define all request body schemas as JSON Schema objects under `components.schemas` in `buildSwaggerSpec()`.

---

## 4. What changes and controls would you put in place for production?

**Security**

- Replace the static `static.json` user store with a proper user database (PostgreSQL) with hashed passwords stored using bcrypt with a work factor of at least 12.
- Move `JWT_SECRET` and all credentials to a secrets manager (AWS Secrets Manager, HashiCorp Vault) — never in `.env` files committed to source control.
- Add rate limiting on the login endpoint (`express-rate-limit`) to prevent brute-force attacks.
- Add `helmet.js` for HTTP security headers (HSTS, XSS protection, CSP, no-sniff).
- Enforce HTTPS-only. Reject plain HTTP requests at the load balancer level.
- Add request ID correlation headers (`X-Request-ID`) generated per request for distributed tracing across services.
- Validate and sanitise all inputs at the API gateway level before they reach the application.

**Data persistence**

- Replace the in-memory `OrderRepository` with a persistent database (PostgreSQL or DynamoDB). The repository pattern is already in place — swapping the implementation requires only a new class that satisfies the same interface, with no changes to services or controllers.
- Add database connection pooling and retry logic with exponential backoff.

**Logging and observability**

- Replace the custom file logger with a structured logging library such as **Winston** or **Pino** that outputs JSON logs. JSON logs are parseable by log aggregation platforms (Datadog, Splunk, CloudWatch).
- Add distributed tracing (OpenTelemetry) so individual requests can be traced across multiple services.
- Expose a `/metrics` endpoint (Prometheus format) tracking request count, error rate, response time percentiles, and active connections.
- Set up alerting on error rate spikes and p99 latency breaches.

**Reliability and scalability**

- Containerise with Docker. Write a multi-stage `Dockerfile` that compiles TypeScript in a build stage and runs the compiled output in a minimal runtime image.
- Deploy via Kubernetes or ECS with horizontal autoscaling based on CPU/request metrics.
- Add a circuit breaker pattern for any external calls (e.g. a real-time stock price API) to prevent cascading failures.
- Implement health checks at both liveness (`/health`) and readiness levels, with readiness checking database connectivity before accepting traffic.

**CI/CD and code quality**

- Enforce TypeScript strict compilation, ESLint, and Prettier as pre-merge pipeline gates.
- Enforce minimum test coverage thresholds (e.g. 80%) in CI — builds fail if coverage drops below the threshold.
- Add integration tests against a real test database using Docker Compose in the CI pipeline.
- Use semantic versioning and automated changelogs on every release.

**Stock price**

- In production the fixed `$100` price would be replaced by a real-time market data integration (e.g. Polygon.io, Alpha Vantage). The `resolveStockPrice()` function in `helper.ts` is the only place that needs to change — services and controllers are unaffected.

---

## 5. How did you use LLMs in this challenge?

LLMs were used as a development accelerator throughout the project — primarily for code generation, debugging, and architectural decisions.

**Project scaffolding.** I used an LLM to generate the initial folder structure, `tsconfig.json` configuration, and `package.json` with the correct dependency versions for `routing-controllers`, `typedi`, `class-validator`, and `swagger-ui-express`. This saved significant time on setup that would otherwise involve reading multiple documentation pages.

**TypeScript decorator wiring.** The combination of `routing-controllers` + `typedi` + `emitDecoratorMetadata` requires specific configuration that is easy to get wrong. I described the error messages I was seeing (`ServiceNotFoundError`, `Cannot find module reflect-metadata`) to the LLM and it identified both the missing `useContainer(Container)` call and the need for `@Service()` on controllers — distinctions that are not obvious from the routing-controllers documentation alone.

**Debugging runtime errors.** When the nodemon infinite restart loop occurred, I shared the symptom with the LLM which immediately identified `config.json` being written inside the watched `src/` directory as the cause and suggested moving the write to the project root. Similarly for the `Cannot set headers after they are sent` error — the LLM identified that `res.setHeader()` inside `res.on("finish")` is invalid because finish fires post-response.

**Swagger spec generation.** When Swagger UI showed `$ref` resolver errors, I shared the error message and the LLM explained that `routing-controllers-openapi` generates `$ref` pointers but does not populate `components.schemas` automatically. It suggested manually defining JSON Schema objects for each request body class — which became the `buildSwaggerSpec()` implementation.

**Test case coverage.** I used the LLM to brainstorm edge cases I might have missed — for example: "what edge cases should portfolio weight validation handle?" which surfaced the floating-point tolerance issue (`33.333 + 33.333 + 33.334 = 99.999` not `100`), and "what should happen if the same unknown symbol appears twice?" which led to reporting all invalid symbols rather than just the first.

In all cases, generated code was reviewed, understood, and adjusted before use — particularly the bcrypt password comparison and JWT signing logic, which were verified against the official library documentation independently.
