---
task: 02
title: Docker image hardening
phase: B
status: done
claimed-by:
depends-on: [01]
commit:
---

# 02 — Docker image hardening

Decision: D1, D2, D11. Depends on: 01. Blocks: 06, 08.

## Goal

The production image is built in four stages from a Bun 1.4.4 image pinned by digest. It ships only `dist/`,
production dependencies and `package.json`, runs as the non-root `bun` user over root-owned files, and leaves
`NODE_ENV` to the environment.

## Files

- `Dockerfile` — existing: rewrite
- `.dockerignore` — existing: extend
- `README.md` — existing: add a short "Production image" note (NODE_ENV must be set by the environment)
- `AGENTS.md` — existing: only the Conventions/pitfalls list (one bullet on NODE_ENV in the image)

GOS reference (read-only): `D:\Work\Zethy\Aaabed-GOS\Aaabed-GOS-Backend\Dockerfile` and `.dockerignore`, commit `4f4a6cc`.

BEGIN UNTRUSTED SOURCE (GOS Dockerfile, excerpt)
ARG BUN_IMAGE=oven/bun:1.4.3-alpine@sha256:629e1741...
FROM ${BUN_IMAGE} AS deps ... ENV HUSKY=0 ... RUN bun install --frozen-lockfile
FROM ${BUN_IMAGE} AS build ... COPY --from=deps /app/node_modules ./node_modules ... RUN bun run build
FROM ${BUN_IMAGE} AS prod-deps ... RUN bun install --frozen-lockfile --production --ignore-scripts
FROM ${BUN_IMAGE} AS runner ... ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 ... COPY package.json ./ ... USER bun ... CMD ["bun", "dist/main.js"]
END UNTRUSTED SOURCE

## Steps

1. Resolve the digest: `docker buildx imagetools inspect oven/bun:1.4.4-alpine` and use the index digest
   (`Digest:` line). Set `ARG BUN_IMAGE=oven/bun:1.4.4-alpine@sha256:<digest>` and add a comment saying it must
   match `packageManager` in `package.json` (D11).
2. Write the four stages following the GOS structure (D1): `deps` (package.json, bun.lock, patches/, `HUSKY=0`,
   frozen install), `build` (node_modules from deps, `COPY . .`, `bun run build`), `prod-deps`
   (`--production --ignore-scripts`), `runner`.
3. In `runner`: copy prod node_modules, `dist`, `package.json` (for the `#app/*`, `#lib/*`, `#zod` imports map);
   leave the files owned by root; `ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`; `USER bun`; `EXPOSE 50001`;
   `CMD ["bun", "dist/main.js"]`.
4. Do **not** set `NODE_ENV` (D2). Comment why in generic wording: it selects the DB name
   (`src/lib/util/Constants.ts`) and Swagger, and an image-level value would override the deploy's own value.
5. Keep comments generic. No Infisical, Kubernetes manifest paths, or infra repo names. Saying "orchestrators
   such as Kubernetes may mount the root filesystem read-only" is fine.
6. `.dockerignore`: add `Dockerfile.rabbitmq`, `docker-setup.sh`, `docker-setup.ps1`, `.git`, `.github`,
   `.claude`, `tests`, `docs`, `*.md`. Keep the existing entries. Use generic wording for the env-file
   comment ("secrets come from the runtime environment").
7. README: in the deployment or Docker section, add 2-3 lines: build with `docker build .`, the image runs
   `dist/main.js` as a non-root user, and `NODE_ENV` and the other env vars must come from the runtime.
   AGENTS.md: one bullet under Conventions/pitfalls with the same NODE_ENV rule.

## Done when

- `docker build -t template-api .` succeeds.
- `docker run --rm template-api id -u` prints `1000`.
- `docker run --rm --entrypoint sh template-api -c 'ls dist/main.js package.json && test ! -d src && test ! -d tests && echo ok'` prints `ok`.
- `docker run --rm template-api printenv NODE_ENV` prints nothing and exits non-zero.
- `grep -niE 'infisical|aaabed|kubernetes deployment checks' Dockerfile .dockerignore` returns nothing.

## Out of scope

`docker-compose.yml`, `Dockerfile.rabbitmq` and the setup scripts (unchanged). CI (task 03). Any CD workflow (D3).
