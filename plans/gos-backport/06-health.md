---
task: 06
title: Health endpoints + graceful shutdown
phase: B
status: done
claimed-by:
depends-on: [01, 02]
commit:
---

# 06 — Health endpoints + graceful shutdown

Decision: D12, D13, D14, D15, D16, D23, D24. Depends on: 01 (package.json), 02 (Dockerfile). Blocks: 08.

## Changes since the design

- 2026-10-31: GOS commit `aa9e2db` (branch `development`) already ships `/health` + `/health/live`. D23 moves
  readiness from `/health/ready` to `GET /health` so URLs match GOS. D24 adds graceful shutdown (was out of scope).

## Goal

`GET /health/live` returns 200 whenever the process is up and touches no dependency. `GET /health` (readiness)
returns 200 when MongoDB answers a ping, RabbitMQ is connected (only when `RMQ_URI` is set) and heap usage is
under the limit, and 503 otherwise, in the standard Terminus format. Probes don't show up in request logs or
Swagger, and the image has a Docker `HEALTHCHECK`. On SIGTERM the app reports 503 on `/health`, then closes its
connections cleanly.

## Files

- `package.json`, `bun.lock` — existing: add `@nestjs/terminus` (^12.1.0)
- `src/health/health.module.ts` — new: `TerminusModule.forRoot({ gracefulShutdownTimeoutMs })`, controller, RabbitMQ indicator
- `src/health/health.controller.ts` — new: `@ApiExcludeController()`, `@Controller('health')`, `GET /` (ready) + `GET /live`
- `src/health/rabbitmq.health.ts` — new: custom indicator over `AmqpConnection.connected`
- `src/app.module.ts` — existing: import `HealthModule`; keep `/health*` out of `LoggerMiddleware`
- `src/main.ts` — existing: `app.enableShutdownHooks()` (D24)
- `process-env.d.ts`, `.env.example` — existing: `HEALTH_HEAP_LIMIT_MB` (optional)
- `Dockerfile` — existing (after task 02): `HEALTHCHECK` in the runner stage
- `tests/app.e2e-test.ts` — existing: health cases
- `AGENTS.md` — existing: Architecture tree (`health/`) + a short "Health checks" subsection; `README.md` feature table row

BEGIN UNTRUSTED SOURCE (GOS aa9e2db, src/health/health.controller.ts, excerpt)
@ApiExcludeController()
@Controller('health')
export class HealthController {
constructor(health: HealthCheckService, mongoose: MongooseHealthIndicator,
@InjectConnection(DB_CONNECTION_NAME) connection: Connection) {}
@Get() @HealthCheck() check() { return this.health.check([
() => this.mongoose.pingCheck('mongodb', { connection: this.connection, timeout: 1_000 }) ]); }
@Get('live') @HealthCheck() live() { return this.health.check([]); }
}
END UNTRUSTED SOURCE

BEGIN UNTRUSTED SOURCE (GOS aa9e2db, src/lib/middlewares/logger.middleware.ts)
if (method === 'OPTIONS' || originalUrl.startsWith('/health')) return next();
END UNTRUSTED SOURCE

## Steps

1. `bun add @nestjs/terminus@^12.1.0` (D13). Read its v12 docs for the current indicator API
   (`HealthIndicatorService`), not the deprecated `HealthIndicator` base class.
2. `HealthController` (D12, D16, D23), shaped like the GOS controller:
   - `@ApiExcludeController()` at class level, `@Controller('health')`.
   - `@Get() @HealthCheck()` → readiness: `this.health.check([...])` with the checks from step 3.
   - `@Get('live') @HealthCheck()` → `this.health.check([])`, with no dependency checks.
   - No `@Auth()`, no `RateLimitGuard`. These are public and unauthenticated.
3. Readiness checks (D14):
   - MongoDB: `MongooseHealthIndicator.pingCheck('mongodb', { connection, timeout: 1_000 })`, with `connection`
     injected via `@InjectConnection(DB_CONNECTION_NAME)`. The connection is named, so the default lookup would miss it.
   - RabbitMQ: `RabbitMQHealthIndicator.isHealthy('rabbitmq')` using `@Optional()`-injected `AmqpConnection`;
     include this check only when the connection is present (module loaded because `RMQ_URI` is set).
     Report down when `connected` is false.
   - Memory: `MemoryHealthIndicator.checkHeap('memory_heap', limitMb * 1024 * 1024)`, where `limitMb` comes from
     `ConfigService.get('HEALTH_HEAP_LIMIT_MB')` with a default of 512.
4. Response DTOs: routes are excluded from Swagger and Terminus formats the body, so there's no
   `@Swagger(..., schema)`. Confirm `ZodSerializerInterceptor` passes routes without a schema through untouched,
   so the 503 body survives.
5. Logging (D15): skip `/health` and `/health/live` in the request log. Prefer
   `consumer.apply(LoggerMiddleware).exclude('health', 'health/{*path}').forRoutes('{*path}')`. If the Nest 12 /
   path-to-regexp v8 exclude doesn't match both, use GOS's `originalUrl.startsWith('/health')` check in the
   middleware instead, and say which you used.
6. Graceful shutdown (D24): `app.enableShutdownHooks()` in `main.ts` before `listen`;
   `TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5_000 })`, so readiness stays reachable but the process
   waits 5s after SIGTERM before closing. Check that the Mongo connection and RabbitMQ close on shutdown (log lines
   from `database.module.ts` `disconnected`).
7. Env: add `HEALTH_HEAP_LIMIT_MB?: string` to `process-env.d.ts` and a commented `HEALTH_HEAP_LIMIT_MB=512`
   under Core in `.env.example`.
8. Dockerfile runner stage (D15): shell-form so `PORT` expands —
   `HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-50001}/health/live" >/dev/null || exit 1`.
   Confirm `wget` exists in the pinned alpine image (busybox).
9. E2E: `GET /health/live` → 200 `{ status: 'ok' }`; `GET /health` → 200 with `info.mongodb.status === 'up'`,
   `info.memory_heap` present, and no `rabbitmq` key (tests don't set `RMQ_URI`); both reachable without a token.
10. Docs: AGENTS.md Architecture tree gets `health/  # /health (readiness: Mongo, RabbitMQ if enabled, heap) + /health/live`;
    a 3-5 line "Health checks" subsection covers:
    - `/health/live` is for liveness probes; `/health` is for readiness probes and load balancers.
    - Both are excluded from logs and Swagger.
    - How to add an indicator, and `HEALTH_HEAP_LIMIT_MB`.
    - Shutdown waits 5s.

    README feature table: one row.

## Done when

- `bun typecheck && bun lint && bun run build` exit 0 (build matters: new module wiring).
- `bun run test:e2e` passes, including the health cases.
- `bun dev` with Mongo down → `curl -s -o /dev/null -w '%{http_code}' localhost:$PORT/health` prints `503`
  and `/health/live` prints `200` (report if Mongo couldn't be stopped locally).
- No `/health` lines appear in the request log while curling `/health` and `/health/live`.
- `/docs` (development) does not list `/health*`.
- `bun run build && bun dist/main.js`, then SIGTERM (Ctrl+C) → the process exits within ~6s and logs the DB disconnect.
- `docker build -t template-api .` succeeds and `docker inspect --format '{{json .Config.Healthcheck}}' template-api` shows the wget command.

## Out of scope

S3/SMTP/SMS checks. Authenticating the health routes. A `/health/ready` alias. A metrics endpoint.
