# Keep in sync with package.json "packageManager" and bun-version in .github/workflows/ci.yml.
ARG BUN_IMAGE=oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a

FROM ${BUN_IMAGE} AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
ENV HUSKY=0
RUN bun install --frozen-lockfile

FROM ${BUN_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM ${BUN_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM ${BUN_IMAGE} AS runner
WORKDIR /app

# NODE_ENV is deliberately unset: it picks the database name (src/lib/util/Constants.ts) and Swagger, so it must
# come from the deploy environment, and an image-level value would override that environment's own.
# Files stay root-owned so the app user can't modify its own code; the transpiler cache is off for read-only filesystems.
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# package.json "imports" resolves #app/*, #lib/* and #zod at runtime.
COPY package.json ./

USER bun
EXPOSE 50001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:${PORT:-50001}/health/live" >/dev/null || exit 1
CMD ["bun", "dist/main.js"]
