# GOS backport — overview

Goal: port the project-agnostic improvements made in the Aaabed GOS backend (a project cloned from this template)
back into the template: a hardened Docker image, hardened CI, two Mongo/PATCH helpers, an optional user phone
with an SMS-format helper, health endpoints, a mail-template build fix, and housekeeping. Also tightens pagination
and adds graceful shutdown (neither is in GOS). All GOS domain code (org structure, employment, `Employee` role) stays out.

## Working agreement

- Repo: `D:\Work\NestJS-Template`, branch `chore/gos-backport` off `main`. Tasks land as separate conventional
  commits (commitlint `config-conventional` is enforced by the hook).
- Source repo `D:\Work\Zethy\Aaabed-GOS\Aaabed-GOS-Backend` is **read-only reference**. Never edit it, and never
  switch its checked-out branch (it's on `feat/entity` with uncommitted work). Read other branches with
  `git -C <repo> show <commit>:<path>`. Generic work lives on two branches: `feat/entity` (HEAD `ce7c7a9`) and
  `development` (commit `aa9e2db`).
- Keep it generic: no `aaabed`, `gos`, `Infisical`, `Kubernetes`, `Aaabed-Infra`, self-hosted runner names, or
  project domains in any file. `grep -rniE 'aaabed|gos-|infisical|aaabed-runners' --exclude-dir={node_modules,dist,.git,plans} .`
  must return nothing.
- Keep existing template scaffolding (unused helpers, RabbitMQ, custom guards/logger); fix in place, don't delete.
- Never hand-edit `src/lib/mongo/zod/*` — edit the schema, run `bun sync`.
- `AGENTS.md` is shared: each task edits only the section named in its Files list. Rebase on conflict, never
  overwrite another task's lines.
- Private methods go at the bottom of a class (AGENTS.md convention).
- Verification every code task runs before `done`: `bun typecheck`, `bun lint`, `bun run build`,
  `bun run test:e2e`. Docker/CI tasks run the commands named in their Done when.
- Not in scope for anyone: a CD workflow (D3), env-driven CORS (D5), unit-test infrastructure.

## Current state (verified 2026-10-31)

| Area               | Today                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dockerfile         | 2 stages, `oven/bun:1-alpine` (floating tag), `ENV NODE_ENV=production`, `CMD ["bun", "start"]`, no `HUSKY=0`                                                                                                                                                                                                                                                                                                                                |
| .dockerignore      | excludes Dockerfile, compose, `.env*`, node_modules, dist only                                                                                                                                                                                                                                                                                                                                                                               |
| CI                 | `.github/workflows/continuous-integration.yml`: push main/development + all PRs, two jobs, `setup-bun@v2` unpinned, Bun 1.4.3, no `permissions:` block                                                                                                                                                                                                                                                                                       |
| Bun                | `package.json` `packageManager: bun@1.4.3`; installed and latest npm `bun` = 1.4.4                                                                                                                                                                                                                                                                                                                                                           |
| `.gitignore`       | no `.claude` entry                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `MongoBaseService` | no grouped-count helper (`src/lib/mongo/MongoBaseService.ts`, ends ~line 313 before `findMany`)                                                                                                                                                                                                                                                                                                                                              |
| `lib/util/Util.ts` | no null-stripping / `$unset` helper; ends with `randomBetween`                                                                                                                                                                                                                                                                                                                                                                               |
| User phone         | `user.schema.ts` has no phone; `NotificationsService.sendSmsAndEmail({ phone, email })` (`src/lib/notifications/notifications.service.ts:17`) takes a string; `SmsProvider.dispatch` expects digits, no `+` (`src/lib/sms/sms.provider.ts:31-33`)                                                                                                                                                                                            |
| User update        | `user.service.ts:53-95` builds `processedData`, `avatarUrl` cleared by storing `null` (`updateAvatar` returns null)                                                                                                                                                                                                                                                                                                                          |
| Mail build         | **bug**: `bun run build` emits JS to `dist/lib/…` but copies `.hbs` to `dist/src/lib/mail/templates/` because `tsconfig.json` `include` has `scripts/**/*`; `src/lib/mail/template.ts:66` reads `import.meta.dirname/templates`. GOS fixed it in `aa9e2db`                                                                                                                                                                                   |
| Typecheck          | `bun typecheck` = `tsc -p tsconfig.eslint.json` (includes `scripts`, `tests`). GOS `aa9e2db` moved it into oxlint `typeCheck: true`; not followed (D22)                                                                                                                                                                                                                                                                                      |
| Health             | none in template; GOS `aa9e2db` has `/health` (Mongo ping, 1s timeout) + `/health/live`, excluded from logs via `startsWith('/health')` in the middleware. `main.ts` has no `enableShutdownHooks`; `LoggerMiddleware` applied to `{*path}` (`src/app.module.ts`); Mongo uses named connection `DB_CONNECTION_NAME`; `AmqpConnection.connected` exists (`@golevelup/nestjs-rabbitmq`); `@nestjs/terminus@12.1.0` peers on Nest `^11 \|\| ^12` |
| Pagination         | identical in GOS. `paginationQuerySchema` (`src/lib/util/Pagination.ts`): omitted `page` = every match, `limit` default 10 with no max; `X-Per-Page` = rows returned; `paginate()` (`MongoBaseService.ts:277`) adds no tiebreaker. Callers: users, audit log, notifications; the XLSX exports `.omit({ page, limit })` and rely on "no page = all"                                                                                           |
| Unit tests         | none; vitest default include matches no file (`tests/*.e2e-test.ts` only run via `test:e2e`)                                                                                                                                                                                                                                                                                                                                                 |
| GOS reference      | Dockerfile/.dockerignore/ci.yml: commit `4f4a6cc`; `countBy`/`withoutNulls`/`setOrUnset`: commit `946de0f`; phone: `src/user/user.request.dto.ts` in GOS; health/mail build/oxlint typecheck: `aa9e2db` (branch `development` only). GOS uncommitted changes are department/subsidiary domain code only                                                                                                                                      |
| Sort indexes       | `AuditLogSchema.index({ createdAt: -1 })`; `NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 })`; `id` is unique on user, audit-log, notification                                                                                                                                                                                                                                                                                |

## Decisions (from grill, 2026-10-31)

| #   | Decision                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Port Docker hardening: 4-stage build (deps → build → prod-deps → runner), Bun image pinned by version **and** digest, `HUSKY=0`, root-owned app files run as `bun`, exec-form `CMD ["bun", "dist/main.js"]`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`, `package.json` copied for the `imports` map, wider `.dockerignore`. |
| D2  | Image does **not** set `NODE_ENV`; the deploy environment supplies it (documented in Dockerfile comment, README, AGENTS.md).                                                                                                                                                                                            |
| D3  | No CD workflow in the template.                                                                                                                                                                                                                                                                                         |
| D4  | Port CI hardening: reusable via `workflow_call`, `permissions: contents: read`, actions pinned by SHA, `persist-credentials: false`, `HUSKY=0`, tsc problem matcher, Bun matches `packageManager`. Triggers: `pull_request` + `push` (main, development) + `workflow_call`.                                             |
| D5  | CORS stays a hardcoded array in `main.ts`; no change.                                                                                                                                                                                                                                                                   |
| D6  | Port `MongoBaseService.countBy(query, '$field') → Map<string, number>`.                                                                                                                                                                                                                                                 |
| D7  | Port `withoutNulls` and `setOrUnset` to `lib/util/Util.ts` and document the convention: in a PATCH, `null` means clear → `$unset`.                                                                                                                                                                                      |
| D8  | User gets optional `phone: { countryCode, number }`, settable via `PATCH /users/me` and `PATCH /users/:id`, validated (`+` + 1-4 digits, digits only, 8-15 digits total).                                                                                                                                               |
| D9  | User update paths clear nullable fields with `$unset` via `setOrUnset` — both `phone` and `avatarUrl`.                                                                                                                                                                                                                  |
| D10 | Add `phoneToRecipient(phone)` util that returns the SMS recipient string (country code digits + number, no `+`); documented beside `sendSmsAndEmail`.                                                                                                                                                                   |
| D11 | Housekeeping: `.claude` in `.gitignore`; `packageManager: bun@1.4.4`, and CI + Dockerfile use the same 1.4.4.                                                                                                                                                                                                           |
| D12 | Health is two public routes: `GET /health/live` (process up, no dependency I/O) and a readiness route (dependencies, 503 when any is down). Path superseded by D23. (grill round 3, 2026-10-31)                                                                                                                         |
| D13 | Built on `@nestjs/terminus`; standard Terminus response body.                                                                                                                                                                                                                                                           |
| D14 | Readiness checks: MongoDB ping on the named connection, RabbitMQ `connected` only when `RMQ_URI` loads the module, and a heap-memory threshold.                                                                                                                                                                         |
| D15 | Health routes are excluded from `LoggerMiddleware`, and the image gets a Docker `HEALTHCHECK` against `/health/live`.                                                                                                                                                                                                   |
| D16 | Health routes are hidden from Swagger (`@ApiExcludeController`).                                                                                                                                                                                                                                                        |
| D17 | List endpoints default to page 1 when `page` is omitted; `page=all` / `-1` remain the explicit opt-in for every match. (grill round 4, 2026-10-31)                                                                                                                                                                      |
| D18 | `limit` is capped at 100; larger values are rejected with 400.                                                                                                                                                                                                                                                          |
| D19 | Response shape unchanged (`{ data, total }` + the four `X-*` headers); only `X-Per-Page` changes to mean the requested page size.                                                                                                                                                                                       |
| D20 | Offset pagination stays; `paginate()` always appends an `id` tiebreaker to the sort so pages are stable.                                                                                                                                                                                                                |
| D21 | Fix the mail-template build path: drop `scripts/**/*` from `tsconfig.json` `include` (as GOS `aa9e2db`). A verified bug, so not asked. (gap review, 2026-10-31)                                                                                                                                                         |
| D22 | Keep `bun typecheck` (tsc). Don't follow GOS's move to oxlint `typeCheck`; the CI typecheck step and the problem matcher stay.                                                                                                                                                                                          |
| D23 | Readiness lives at `GET /health` (same URL as GOS), with `/health/live` for liveness; no `/health/ready`.                                                                                                                                                                                                               |
| D24 | Graceful shutdown: `app.enableShutdownHooks()` in `main.ts` + Terminus `gracefulShutdownTimeoutMs`.                                                                                                                                                                                                                     |
| D25 | Delete `plans/` in a final commit before merge; no UPGRADING.md.                                                                                                                                                                                                                                                        |

Assumptions (not asked):

- CI file renamed `continuous-integration.yml` → `ci.yml` (matches GOS; nothing references the old name — verify in task 03).
- CI collapses to one job like GOS, on `ubuntu-latest` (GOS's runner label is project-specific).
- Action SHAs reused from GOS `ci.yml` (`actions/checkout@11d5960a…` v4, `oven-sh/setup-bun@0c5077e5…` v2.2.0).
- Phone is not unique and not indexed (GOS doesn't either).
- GOS's other user changes are not ported: `getMe`→`getCurrentUser` rename, `findUsers` split, `employeeId`, OR-grouped
  `Employees.*` permissions, `Users.Support`. `populateUsers` (already in the template) stays as is.
- No unit-test runner is added; helpers are covered through e2e tests on the user endpoints.
- `@types/bun` stays at `^1.4.3` (semver range already admits 1.4.4).
- Heap limit comes from optional `HEALTH_HEAP_LIMIT_MB`, default 512.
- RabbitMQ indicator gets `AmqpConnection` via `@Optional()` injection; the check is omitted when it's absent.
- Health routes are unauthenticated and not rate-limited.
- Docker `HEALTHCHECK`: interval 30s, timeout 3s, start period 20s, 3 retries, busybox `wget`.
- Pagination: the page=1 default lives in the query schema only; `MongoBaseService.paginate()` still treats
  `page: undefined` as "everything", so the user and audit-log XLSX exports keep working unchanged.
- `page=all` ignores `limit`, so the 100 cap doesn't apply to it.
- `id` tiebreaker uses the direction of the last sort key; with no sort it is `{ id: 1 }` (matches today's
  insertion order, since Snowflake ids are time-ordered).
- `X-Per-Page` for `page=all` = total.
- Pagination e2e goes in a new `tests/pagination.e2e-test.ts` to avoid edit conflicts in `app.e2e-test.ts`.
- Sort indexes gain `id` (`{ createdAt: -1, id: -1 }` on audit log, `{ userId, read, createdAt: -1, id: -1 }` on
  notifications) so the tiebreaker sort uses an index; old indexes on existing DBs are not dropped automatically.
- Mongo ping timeout 1s (as GOS); `gracefulShutdownTimeoutMs` 5s.
- Health log exclusion via Nest `.exclude()`, falling back to GOS's `startsWith('/health')` check if the
  exclude pattern doesn't match.
- Phone is not added to the user XLSX export or to `POST /auth/register` (only the PATCH routes, per D8).

## Tasks and order

```
 01 housekeeping ──┬──► 02 docker ──► 06 health ──┐
                   └──► 03 ci ───────────────────┤
 04 helpers ──┬───────► 05 phone ────────────────┼──► 08 cross-verification ──► 09 remove plans/
              └───────► 07 pagination ───────────┘
```

| File                      | Task                                                                                              | Est.  |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| 01-housekeeping.md        | `.gitignore` `.claude`, `packageManager` bun@1.4.4, lockfile check, mail-template build fix       | 0.2d  |
| 02-docker-hardening.md    | 4-stage Dockerfile, digest pin, no NODE_ENV, `.dockerignore`, docs                                | 0.5d  |
| 03-ci-hardening.md        | `ci.yml`: workflow_call, permissions, SHA pins, HUSKY=0, Bun 1.4.4, docs                          | 0.25d |
| 04-mongo-patch-helpers.md | `countBy`, `withoutNulls`, `setOrUnset`, AGENTS.md convention                                     | 0.25d |
| 05-user-phone.md          | phone field + DTOs + `$unset` clears + `phoneToRecipient` + e2e                                   | 0.75d |
| 06-health.md              | terminus `/health` + `/health/live`, log/Swagger exclusion, Docker HEALTHCHECK, graceful shutdown | 0.6d  |
| 07-pagination.md          | page=1 default, limit ≤ 100, `X-Per-Page` = limit, `id` tiebreaker + indexes, e2e                 | 0.5d  |
| 08-cross-verification.md  | genericity grep, preflight, e2e, docker build, docs consistency                                   | 0.25d |
| 09-remove-plan.md         | delete `plans/` before merge, board into PR description                                           | 0.05d |

Wave 1 (parallel): 01, 04. Wave 2: 02, 03, 05, 07. Wave 3: 06. Wave 4: 08. Wave 5: 09.

## Deferred, do not bury

- **CD workflow (build → Trivy → GHCR).** Not shipped per D3. GOS `.github/workflows/cd.yml` is the reference if a
  project wants one; CI is already `workflow_call`-ready (D4).
- **Env-driven CORS origins.** Not shipped per D5. Projects edit `CORS_ORIGINS` in `src/main.ts`.
- **Oxlint type checking.** Not adopted per D22. GOS `aa9e2db` (`oxlint.config.mts` `typeCheck: true`,
  `lint:check --format=github`) is the reference if the template later drops tsc.
- **Back-porting to existing clones.** No UPGRADING.md per D25. GOS needs, at minimum, the D21 build fix if
  its `feat/entity` branch still lacks `aa9e2db`. Its pagination, `null` handling and image `NODE_ENV` stay as they are unless someone ports them.
