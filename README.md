<div align="center">

# NestJS Template

**Batteries-included backend starter.** Auth, users, audit logging, notifications, S3 uploads and MongoDB
wired up so you don't set it up again for every new project.

</div>

## What's in the box

| Area          | Choice                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| Framework     | NestJS on Fastify                                                                       |
| Runtime       | Bun                                                                                     |
| Database      | MongoDB via Mongoose, with a generic `MongoBaseService<T>` CRUD base class              |
| Validation    | Zod 4 — DTOs are schemas + `z.infer` types, validated by Nest's standard-schema support |
| Auth          | JWT access + refresh tokens bound to server-side sessions (max 3/user), argon2 hashing  |
| Notifications | In-app feed + web push (VAPID) + SMS (Unifonic) + email (SMTP/nodemailer, branded HTML) |
| Queue         | RabbitMQ (`@golevelup/nestjs-rabbitmq`) with the delayed-message-exchange plugin        |
| Storage       | AWS S3 upload/cleanup helpers, used by the user avatar flow as a working example        |
| Audit log     | Append-only action log, queryable/exportable with `AuditLog.*`                          |
| Docs          | Swagger UI at `/docs` in development, generated from Zod schemas                        |
| Quality       | Oxlint + Oxfmt (`@imranbarbhuiya/oxc-config`), Husky pre-commit, Vitest                 |

Authorization is role-based: every user has a `role` (`Admin` or `User`) and routes declare what they need with
`@RequirePermissions(...)`. `user.superAdmin` passes every check. The catalog and role grants live in
`src/lib/util/Permissions.ts`; `GET /roles` and `GET /roles/permissions` expose them, and `GET /users/me` returns
the caller's effective `permissions`. `Admin` gets every permission; `User` gets none, so it can only read and
update its own profile through `/users/me`. Only super admins can update or delete a super admin account.

Responses are filtered through the route's response DTO: fields the DTO doesn't declare (`_id`, `password`,
`sessions`, push `subscriptions`) are stripped before they leave the API.

## Getting started

```bash
bun install
cp .env.example .env   # fill in DB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET at minimum

# Windows PowerShell
.\docker-setup.ps1
# Linux/Mac/WSL
./docker-setup.sh

bun dev
```

Docker starts MongoDB and RabbitMQ (with the delayed-message plugin) via `docker-compose.yml`. RabbitMQ is
optional: the queue module only loads when `RMQ_URI` is set, so leave it empty (and drop the `rabbitmq` service
from the compose file) if you don't need delayed jobs.

### Creating the first admin

Self-registered accounts start as `Requested` and need an admin to approve them, so create the first account
from the command line. It's created as `Accepted` and can log in straight away:

```bash
bun scripts/createUser.ts --name "Jane Doe" --email jane@example.com --role Admin --super-admin
```

| Flag            | Required | Description                                                                  |
| --------------- | -------- | ---------------------------------------------------------------------------- |
| `--name`        | yes      | Display name                                                                 |
| `--email`       | yes      | Login email (stored lowercase, must be unique)                               |
| `--password`    | no       | At least 8 characters. Omit it to be prompted, which keeps it out of history |
| `--role`        | no       | `Admin` or `User` (default `User`)                                           |
| `--super-admin` | no       | Grants super admin, which passes every permission check                      |

Run it from the project root so Bun loads `DB_URI` from `.env`.

Services after setup:

- MongoDB — `mongodb://localhost:27017`
- RabbitMQ — `amqp://app:app123@localhost:5673`
- RabbitMQ Management UI — http://localhost:15673 (user: `app`, pass: `app123`)

## Commands

| Task                                            | Command                                             |
| ----------------------------------------------- | --------------------------------------------------- |
| Dev                                             | `bun dev`                                           |
| Build                                           | `bun run build`                                     |
| Start                                           | `bun start`                                         |
| Lint                                            | `bun lint`                                          |
| Format                                          | `bun format`                                        |
| Typecheck                                       | `bun typecheck`                                     |
| Regenerate Zod DTOs from Mongoose schemas       | `bun sync`                                          |
| Unit tests                                      | `bun run test`                                      |
| E2E tests                                       | `bun run test:e2e`                                  |
| Everything — run before committing              | `bun run preflight`                                 |
| Docker: setup / restart / clean / logs / status | `./docker-setup.sh <action>` (or `.ps1` on Windows) |

## Project layout

```
scripts/
└── createUser.ts          # Create a user from the CLI (first admin) — not part of the build

src/
├── app.module.ts          # Wires every module together
├── main.ts                # Fastify bootstrap, Swagger, @fastify/helmet, CORS
├── audit-log/              # Audit log module
├── auth/                   # Register / login / refresh / logout / change password
├── user/                   # Profile + admin user management
├── notification/           # In-app notification feed
├── push-notification/      # Web push VAPID key + subscribe routes
├── roles/                  # Read-only roles + permission catalog routes
└── lib/
    ├── auth/                # JwtAuthModule (global JwtModule + AuthGuard)
    ├── decorators/           # @Auth(), @SuperAdmin(), @RequirePermissions(), @User(), @Swagger()
    ├── guard/                # AuthGuard, SuperAdminGuard, PermissionsGuard, RateLimitGuard
    ├── mail/                 # MailService (SMTP) + HTML templates/ rendered into a shared layout
    ├── mongo/                # Schemas, generated Zod DTOs (mongo/zod), services, MongoBaseService
    ├── notifications/        # Web push + NotificationsService fan-out (in-app, push, SMS + email)
    ├── rabbitmq/              # Delayed notification queue
    ├── s3/                    # Attachment upload/cleanup helpers
    ├── sms/                  # SMS: swappable SmsProvider, Unifonic by default
    ├── scripts/               # bun sync — Mongoose schema -> Zod DTO generator
    ├── util/                  # Snowflake IDs, sorting, xlsx export, etc.
    └── zod/                   # ZodValidationPipe, ZodSerializerInterceptor, Swagger converter
```

## Adding a new module

Copy the pattern of the existing modules:

1. Add a Mongoose schema in `src/lib/mongo/schemas/<name>.schema.ts` (see `user.schema.ts`).
2. Run `bun sync` to generate the matching Zod DTO in `src/lib/mongo/zod/<name>.dto.ts`.
3. Add a `Mongo<Name>Service extends MongoBaseService<I<Name>ZodSchema>` under `src/lib/mongo/<name>/`, then
   register the schema + service in `database.module.ts` and export both from `src/lib/mongo/index.ts`.
4. Create `src/<name>/` with a controller, service, module, and request/response DTOs: a Zod schema
   (`FooDtoSchema`) and its `z.infer` type (`FooDto`), wired in with `@Body({ schema: FooDtoSchema })`. Protect routes with `@Auth()`, `@RequirePermissions(...)` or `@SuperAdmin()`; put `@UseGuards(new RateLimitGuard(...))`
   above them so the limit keys on the user. Pass the response DTO to `@Swagger()` / `@SwaggerPaginated()` —
   that's also what strips undeclared fields from the response. If the route takes a `sort` query, pass
   `parseSortQuery` the list of fields clients may sort by.
5. Import the new module in `src/app.module.ts`.

## Conventions

`AGENTS.md` (referenced from `CLAUDE.md`) is the entry point for coding agents — architecture, the
module-adding checklist above in more detail, the auth/audit-log conventions, and pitfalls to avoid.

## Environment

See `.env.example` for the full list and `process-env.d.ts` for types. Only `DB_URI`,
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are required to boot; S3, RabbitMQ, SMS, mail and web push
are only needed if you use those features.

**CORS:** `src/main.ts` only allows `http://localhost:<any port>` (`CORS_ORIGINS`). Add your frontend's origin(s)
there before deploying, or browsers will block its requests.

Request bodies are capped at 50 MB (`bodyLimit` in `src/main.ts`). Attachments are sent base64-encoded in JSON,
which adds about a third to the file size, so this allows uploads of roughly 37 MB.

## Troubleshooting

- **Docker services won't start** — make sure Docker Desktop is running, then rerun the setup script;
  check `docker compose logs -f` / `docker compose ps`.
- **DB connection errors** — confirm `DB_URI` matches the running MongoDB container.
- **RabbitMQ connection errors** — confirm `RMQ_URI` matches `amqp://app:app123@localhost:5673/` and the
  delayed-message plugin is enabled: `docker exec app-rabbitmq-dev rabbitmq-plugins list | grep delayed`.
- **Swagger not loading** — check `NODE_ENV=development` and `DISABLE_SWAGGER` isn't `true`.
- **Push notifications throwing on boot** — outside development, `PushNotificationService` fails fast when
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are missing or invalid; in development it only warns
  and disables push. Generate a key pair with `npx web-push generate-vapid-keys`.
- **Emails not arriving** — without `SMTP_HOST`, `MailService` logs emails to the console in development and
  skips them elsewhere.

## License

MIT © [Sarcaster](https://github.com/sarcasterXO)
