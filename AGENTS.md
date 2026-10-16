# NestJS Template

Batteries-included backend starter: auth, users, audit logging, notifications (in-app + push + SMS +
email), S3 uploads, MongoDB, Zod validation. Meant to be cloned and extended per project — see
`README.md` for the human-facing overview.

- **Package manager / runtime:** Bun
- **Stack:** NestJS on Fastify, Mongoose (MongoDB), Zod 4, RabbitMQ (`@golevelup/nestjs-rabbitmq`), AWS S3,
  argon2, nodemailer, web-push, Vitest

## Commands

| Task                              | Command                                             |
| --------------------------------- | --------------------------------------------------- |
| Dev (watch mode)                  | `bun dev`                                           |
| Build                             | `bun run build`                                     |
| Start (runs the build)            | `bun start`                                         |
| Lint                              | `bun lint`                                          |
| Format                            | `bun format`                                        |
| Typecheck                         | `bun typecheck`                                     |
| Regenerate Zod DTOs from schemas  | `bun sync` (add `--force` to bypass the hash cache) |
| Unit tests                        | `bun run test`                                      |
| E2E tests                         | `bun run test:e2e`                                  |
| Everything, run before committing | `bun run preflight`                                 |

The git pre-commit hook only runs `lint-staged` (fast, staged files only). `preflight` is the full
format+typecheck+lint+build check — run it yourself before opening a PR; CI runs lint, format check,
build, and typecheck, but not the tests, so run `bun run test` and `bun run test:e2e` locally. E2E tests boot
the whole app against an in-memory MongoDB (`mongodb-memory-server`), so they need no Docker or `.env`.

After any non-trivial change, run `bun typecheck` and then `bun lint` at minimum; run `bun run build` too if you touched
module wiring (`app.module.ts`, any `*.module.ts`) since Nest DI errors only surface at bootstrap, not
at typecheck time.

## Architecture

```
scripts/
└── createUser.ts          # Create a user from the CLI (first admin) — not part of the build

src/
├── app.module.ts          # Wires every module together — new modules get imported here
├── main.ts                # Fastify bootstrap, Swagger, @fastify/helmet, CORS
├── audit-log/              # Audit log module
├── auth/                   # Register / login / refresh / logout / change password
├── user/                   # Profile + admin user management
├── notification/           # In-app notification feed
├── push-notification/      # Web push VAPID key + subscribe routes
├── roles/                  # Read-only roles + permission catalog routes
└── lib/
    ├── auth/                # JwtAuthModule: global JwtModule + AuthGuard (not the auth/ feature)
    ├── decorators/           # @Auth(), @SuperAdmin(), @RequirePermissions(), @User(), @Swagger()
    ├── guard/                # AuthGuard, SuperAdminGuard, PermissionsGuard, RateLimitGuard
    ├── mail/                 # Global MailModule: MailService + templates/ (layout.hbs, one .hbs + .ts per email)
    ├── mongo/
    │   ├── schemas/           # Mongoose schemas — the source of truth
    │   ├── zod/               # GENERATED Zod DTOs, one per schema — do not hand-edit
    │   ├── <entity>/          # MongoBaseService<T> subclasses, one folder per entity
    │   ├── database.module.ts # Registers every schema + service, connects to MongoDB
    │   └── index.ts           # Re-exports schemas/services/types — the only import path other modules use
    ├── notifications/        # Global module: PushNotificationService, NotificationsService (fan-out)
    ├── rabbitmq/              # Delayed notification queue
    ├── s3/                    # Attachment upload/cleanup helpers + S3FolderPaths
    ├── sms/                  # Global SmsModule: SmsProvider (bound to UnifonicSmsProvider)
    ├── scripts/               # bun sync — Mongoose schema -> Zod DTO generator
    ├── util/                  # Snowflake IDs, sorting, xlsx export, Diff (audit changes), Permissions (RBAC), etc.
    └── zod/                   # ZodValidationPipe, ZodSerializerInterceptor, standardSchemaConverter (Swagger)
```

Other modules only ever import from `#app/mongoose` (i.e. `src/lib/mongo/index.ts`), never reach into
`lib/mongo/schemas` or `lib/mongo/zod` or a specific `lib/mongo/<entity>/*.service.ts` file directly.

### Adding a new entity/module

1. Add a Mongoose schema in `src/lib/mongo/schemas/<name>.schema.ts` (copy `user.schema.ts`'s shape).
2. Run `bun sync` — regenerates `src/lib/mongo/zod/<name>.dto.ts` and its barrel export. Never hand-edit
   files under `lib/mongo/zod`; they're overwritten on the next sync.
3. Add `Mongo<Name>Service extends MongoBaseService<I<Name>ZodSchema>` under `src/lib/mongo/<name>/`,
   register the schema + service in `database.module.ts`, and export both from `lib/mongo/index.ts`.
4. Create `src/<name>/` with a controller, service, module, and `*.request.dto.ts` / `*.response.dto.ts`. Each DTO
   is a Zod schema plus its inferred type: `export const FooDtoSchema = fooSchema.meta({ id: 'FooDto' })` and
   `export type FooDto = z.infer<typeof FooDtoSchema>`. Controllers validate with `@Body({ schema: FooDtoSchema }) body: FooDto`
   / `@Query({ schema })` (Nest's standard-schema support, run by the global `ZodValidationPipe`). Leave `.meta({ id })`
   off query schemas: a named root becomes a `$ref` and Swagger can't expand it into query params.

   Build request and response DTOs from the generated Mongo Zod schemas (`UserZodSchema` etc. from `#app/mongoose`)
   wherever a field maps to a stored one: `.pick()` / `.omit()` / `.extend()` the entity schema, or reuse a single
   field via `.shape.<field>` and add the request-only rules on top (`UserZodSchema.shape.name.min(1)`). Don't
   redeclare a stored field with a fresh `z.string()`/`z.enum()`, since that's how DTOs drift from the schema. Strip
   `.default()` with `.unwrap()` in update DTOs, or Zod fills the default in for omitted keys. Hand-write a field
   only when the request format differs from what's stored (e.g. `emailSchema` normalizes, avatars arrive as
   attachments) or it isn't stored at all. Protect routes with `@Auth()`, `@RequirePermissions(...)` or `@SuperAdmin()`. List
   endpoints call `MongoBaseService.paginate(query, { page, limit, sort })` and return
   `sendPaginated(reply, result, page, limit)` (`lib/util/Pagination.ts`): the body is `{ data, total }` and the
   same counts go in `X-Total-Count` / `X-Total-Pages` / `X-Current-Page` / `X-Per-Page` headers (exposed via
   CORS). Query DTOs extend `paginationQuerySchema` (`page` omitted, `all` or `-1` returns everything; `limit`
   defaults to 10). Build the response DTO with `paginatedSchema(itemSchema)` and use `@SwaggerPaginated()` so the
   headers show in Swagger. Sortable endpoints pass `parseSortQuery(sort, SORTABLE_FIELDS)` an explicit allow list —
   never let clients sort on `select: false` fields.

   Response DTOs are enforced, not just documented: `@Swagger(desc, FooDtoSchema)` / `@SwaggerPaginated(desc, FooDtoSchema)`
   record the schema, and the global `ZodSerializerInterceptor` parses every response through it, stripping undeclared
   fields. The DTO must describe what the handler actually returns, or the request fails with a 500 and the Zod
   issues are logged. Routes without a schema (file downloads) pass through untouched.

5. Import the new module in `src/app.module.ts`.

### Auth model

Tokens are bound to server-side sessions stored on the user
(`sessions: [{ id, refreshHash, userAgent, createdAt, lastUsedAt }]`, `select: false`). The access JWT (6h) carries
`{ id, sid }`, the refresh JWT `{ id, sid, rid }`, where `rid` is random and only its SHA-256 (`refreshHash`) is
stored. Sessions expire `SESSION_TTL_MS` (180 days) after login however active they are: `AuthGuard` and refresh both
reject sessions past `sessionCutoff()`, and a rotated refresh token keeps the original `exp`. Login prunes expired
sessions, then pushes the new one and keeps the 3 most recently used (`lastUsedAt`, bumped on refresh); refresh
rotates `rid` atomically, and replaying an old refresh token revokes the whole session. `AuthGuard` rejects tokens whose session is gone and users whose `status` isn't
`Accepted`. To log a user out everywhere (password change, deactivation, delete), set `sessions: []`.

`JwtAuthModule` is imported once in `AppModule` and is global — feature modules don't import it.

**Roles & permissions** live in `lib/util/Permissions.ts`, hardcoded (no roles collection). `Permissions` is the
catalog (`Users.View`, `AuditLog.Export`, …), `PermissionLabels` must cover every key (enforced by `satisfies`),
and `Roles` maps each of `RoleNames` (`Admin` = everything, `User` = nothing beyond its own `/users/me`) to its grants. Users carry
`role` (default `User`). Routes are public, `@Auth()` (any logged-in user), `@RequirePermissions([...], [...])`
(`@Auth()` + `PermissionsGuard`; each array is an AND-group, the groups are OR'd), or `@SuperAdmin()`.
`user.superAdmin` passes every permission check, and only a super admin may update or delete another super admin
(checked in `UserController`). Use `permissionsFor(user)` for checks inside a service. To add a
permission: add the key to `Permissions`, its label to `PermissionLabels`, and grant it in `Roles`; to add a role,
extend `RoleNames` + `Roles` and run `bun sync` (the user schema enum reads `RoleNames`).

`RateLimitGuard` is a per-instance token bucket keyed by user (or IP) + method + route. Guards from
`@UseGuards` run in decorator order bottom-up, so put `@UseGuards(new RateLimitGuard(...))` **above**
`@Auth()` / `@RequirePermissions()` / `@SuperAdmin()` — below them it runs before auth and keys on IP.

### Audit log

`src/audit-log` covers CRUD changes plus login/logout. Entries look like:

```ts
await this.auditService.create({
	user: { id: actor.id, name: actor.name }, // pass both — avoids a name-backfill query later
	action: 'user updated', // 'user created' | 'user updated' | 'user deleted' | 'user login' | 'user logout'
	message: `User Updated: "${target.name}" (ID: ${target.id})`,
	documentId: target.id,
	changes: diffObjects(before, after), // src/lib/util/Diff.ts — omit for login/logout, there's nothing to diff
});
```

`diffObjects(before, after, options?)` walks two objects and returns human-readable change lines
(`"name: AB -> name: AC"`), collapsing nested objects/arrays into a `"N fields/elements changed"`
summary once they exceed `summarizeThreshold` (default 5) so bulk updates don't flood the log. Never
diff fields with `select: false` in the schema (`password`, `sessions`) — they
aren't present on documents fetched without an explicit `+field` select, so this is safe by default, but
don't go out of your way to select and diff them.

### Notifications

`NotificationsModule` (`lib/notifications`), `MailModule` (`lib/mail`) and `SmsModule` (`lib/sms`) are global;
inject services directly.

- `NotificationsService.notifyUser(userId, { title, body })` — in-app feed + web push to every live
  subscription; dead subscriptions (404/410) are pruned.
- `NotificationsService.sendSmsAndEmail({ phone, email }, { subject, text, html? })` — OTP/critical alerts
  over both channels in parallel, returns `{ smsSent, emailSent }`.
- `SmsProvider.sendSms(phone, body)` for SMS only. To switch vendors, add a class extending `SmsProvider` (implement `dispatch`) and change the `useClass` in `sms.module.ts`.
- `MailService` for email only. Without `SMTP_HOST`, mail is logged to the console in development and skipped
  elsewhere.

### Mail templates

Every email is a body template rendered into `lib/mail/templates/layout.hbs`. Send one with
`mailService.send(to, otpEmail({ otp }))` — import the builder from `lib/mail`, pass its args, and the layout,
brand and theme are applied for you. `mailService.render(...)` returns `{ subject, html, text }` without sending.

To add an email, create two files in `lib/mail/templates/` and export the builder from `templates/index.ts`:

- `<name>.hbs` — the body only, no `<html>`/layout. `{{var}}` is HTML-escaped, `{{{var}}}` is inserted raw (only
  for HTML you built and escaped yourself). Every template also gets `brandName`, `companyName`, `supportEmail`,
  `year` and the `MAIL_THEME` colors (`{{colorBrandCore}}`, …) — use those instead of hex values.
- `<name>.ts` — `export const <name>Email = (args): MailTemplate => (brand) => ({ template: '<name>', subject,
  vars, text?, preheader? })`. Copy `otp.ts`.

A variable used in the HTML but missing from `vars` throws at send time, so typos don't ship half-rendered
emails. `nest-cli.json` copies `templates/**/*.hbs` into `dist`; keep templates in that folder.

## Conventions / pitfalls

- **Zod DTOs are generated, not written.** Anything under `src/lib/mongo/zod/` regenerates from the
  matching `src/lib/mongo/schemas/*.schema.ts` via `bun sync`. Edit the schema, then sync — don't patch
  the `.dto.ts` output by hand, it'll be silently overwritten.
- **Private methods go at the bottom of the class**, after every public method — never in between public
  methods. Order: fields, constructor, public methods, protected methods, private methods. Lint doesn't enforce
  this, so check it yourself when adding a method.
- **`MongoBaseService<TInput, TOutput>`** (`lib/mongo/MongoBaseService.ts`) is the CRUD base every
  Mongo service extends — don't hand-roll find/create/update/delete on a new service.
- **S3 uploads** go through `S3BaseService` (`lib/s3/s3.ts`): a feature service extends it and calls
  `super(S3FolderPaths.<entity>)`, like `UserService`. Uploaded file names are trimmed to 30 chars, stored raw in
  the key, percent-encoded only in the URL, and every URL gets a `?v=<timestamp>` so clients never serve a stale
  cached file. Compare/delete attachments by key (`s3UrlToKey`), never by raw URL — the `?v=` differs per upload.
- **`S3FolderPaths`** (`lib/s3/s3-folder-paths.ts`) only holds top-level entity prefixes (e.g. `users`).
  Subfolders (`documents`, `attachments`, etc.) are part of the `key` argument passed to the S3 methods at
  the call site, not baked into `S3FolderPaths` — this keeps one entity's attachments (of any kind)
  deletable via a single `deleteS3Directory(\`${id}/\`)` call.
- Env vars are typed in `process-env.d.ts` and documented in `.env.example` — keep both in sync when you
  add a new one. Injectable services read them through `ConfigService`; `process.env` is only for code that
  runs at import time (decorator constants, `s3.ts`). `bun dev` passes `--env-file .env` so those
  import-time reads work under Node.
- RabbitMQ is opt-in: `app.module.ts` registers `CommonRabbitMQModule` through
  `ConditionalModule.registerWhen(..., (env) => Boolean(env.RMQ_URI))`, so it only loads when `RMQ_URI` is set.
  Anything that injects `RabbitMQService` therefore needs `RMQ_URI`. Pass a function, not the `'RMQ_URI'` string —
  the string form treats an unset variable as enabled.
- The first admin comes from `bun scripts/createUser.ts` (see README); there's no seed or bootstrap
  route, and there's deliberately no `package.json` script for it.
