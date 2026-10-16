FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY patches patches
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY patches patches
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build /app/dist dist

USER bun
EXPOSE 50001
CMD ["bun", "start"]
