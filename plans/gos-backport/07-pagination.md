---
task: 07
title: Pagination defaults, limit cap, stable order
phase: B
status: done
claimed-by:
depends-on: [04]
commit:
---

# 07 — Pagination defaults, limit cap, stable order

Decision: D17, D18, D19, D20. Depends on: 04 (both edit `MongoBaseService.ts`). Blocks: 08.

## Goal

List endpoints return page 1 when `page` is omitted. `page=all` / `-1` still return everything as an explicit
opt-in. `limit` above 100 is rejected with a 400. `X-Per-Page` reports the requested page size. Pages are stable
because `paginate()` always adds an `id` tiebreaker to the sort. The response body stays `{ data, total }`.

## Files

- `src/lib/util/Pagination.ts` — existing: `paginationQuerySchema` (`page` default, `limit` max), `sendPaginated` (`X-Per-Page`)
- `src/lib/mongo/MongoBaseService.ts` — existing: `paginate()` adds the `id` tiebreaker
- `src/lib/mongo/schemas/audit-log.schema.ts`, `notification.schema.ts` — existing: add `id` to the sort indexes (step 4a); then `bun sync`
- `tests/pagination.e2e-test.ts` — new: a separate file, so it doesn't conflict with the edits that tasks 05 and 06 make to `app.e2e-test.ts`
- `AGENTS.md` — existing: the pagination sentences in "Adding a new entity/module" step 4 only
- `README.md` — existing: only if it describes "omit page = everything" (grep `page` first)

BEGIN UNTRUSTED SOURCE (src/lib/util/Pagination.ts, 2026-10-31)
page: z
.union([z.enum(['all', '-1']).transform(() => undefined), z.coerce.number().int().positive()])
.optional()
.meta({ description: 'Page number. Omit it, or pass "all" or -1, to return every match.' }),
limit: z.coerce.number().int().positive().default(10)...
'X-Per-Page': result.data.length,
END UNTRUSTED SOURCE

BEGIN UNTRUSTED SOURCE (src/lib/mongo/MongoBaseService.ts:277-284, 2026-10-31)
public async paginate(query, { page, limit = 10, sort }: PaginateOptions = {}) {
const range = page === undefined ? {} : { skip: limit * (page - 1), limit };
const [data, total] = await Promise.all([this.findMany(query, '', { ...range, sort }), this.count(query)]);
END UNTRUSTED SOURCE

## Steps

1. `paginationQuerySchema.page` (D17): omitted → `1`; `'all'` / `'-1'` → `undefined` (everything); positive
   int → that page. Apply the default **in the query schema only**. `MongoBaseService.paginate()` keeps
   "`page: undefined` = everything", because the export endpoints rely on it: `ExportUsersQueryDtoSchema` and
   `ExportAuditLogsQueryDtoSchema` `.omit({ page, limit })`, and their services call `paginate` with no page.
   Update the `.meta` description to say omitted = 1 and `all`/-1 = every match.
2. `limit` (D18): `.max(100)` so 101 → 400 via `ZodValidationPipe`. Export a `MAX_PAGE_LIMIT = 100` constant
   and use it in the schema and description. `page=all` ignores `limit`, as today.
3. `sendPaginated` (D19): `X-Per-Page` = `limit` when `page` is set, `result.total` when `page` is undefined.
   Keep the other headers and the `{ data, total }` body unchanged. Update the `PAGINATION_HEADERS['X-Per-Page']`
   description to "Page size requested".
4. `paginate()` (D20): build the effective sort as `{ ...sort, id: <dir> }` unless `sort` already has `id`. `<dir>` is
   the direction of the last key in `sort`, or `1` when `sort` is empty. Every current schema has a unique `id`
   (`user`, `audit-log`, `notification`). Note in the JSDoc that new schemas must keep a unique `id` for this to hold.
   4a. Indexes for the tiebreaker (D20): change `AuditLogSchema.index({ createdAt: -1 })` to
   `{ createdAt: -1, id: -1 }` and `NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 })` to
   `{ userId: 1, read: 1, createdAt: -1, id: -1 }`, then `bun sync`. Note in AGENTS.md that existing deployments
   keep the old index until someone runs `syncIndexes()` or drops it, because Mongoose `autoIndex` creates new
   indexes but never drops old ones.
5. Check every caller still compiles and behaves: `user.service.ts` (`getAllUsers`, `exportUsers`),
   `audit-log.service.ts` (`findAll` from list + export), `notification.service.ts` (`sort: { createdAt: -1 }` →
   gets `id: -1`).
6. E2E `tests/pagination.e2e-test.ts`. Copy the boot/`request`/login setup from `tests/app.e2e-test.ts`. Create
   ~12 users with identical `createdAt` (set them directly through `MongoUserService.model`) and an admin token:
   - `GET /users` (no page) → 10 rows, `X-Current-Page: 1`, `X-Per-Page: 10`, `X-Total-Pages` = ceil(total/10).
   - `GET /users?page=all` → all rows, `X-Total-Pages: 1`, `X-Per-Page` = total.
   - `GET /users?limit=101` → 400; `limit=100` → 200.
   - `GET /users?sort=createdAt&limit=5&page=1..3`: the concatenated ids have no duplicates and equal the full set.
   - `GET /users/export` still returns every user (row count in the XLSX = total; parse it with `exceljs`).
7. Docs: in AGENTS.md step 4, replace "`page` omitted, `all` or `-1` returns everything" with the new rule, add
   the 100 cap and the `id` tiebreaker, and keep the export-schema `.omit({ page, limit })` pattern as the way to
   get everything internally.

## Done when

- `bun typecheck && bun lint && bun run build` exit 0.
- `bun run test:e2e` passes, including `tests/pagination.e2e-test.ts` and the existing `app.e2e-test.ts` (which
  checks the `page`/`limit`/`sort`/`name` query params in Swagger).
- `grep -n "Omit it" src/lib/util/Pagination.ts` returns nothing (old description gone).

## Out of scope

Cursor pagination. Changing the body shape (`meta`), or dropping or renaming headers. Per-endpoint limit caps.
Changing export endpoints.
