# Single image: builds the PWA + server, runtime serves both from one Node
# process. One container, not two — matches the "impossible to babysit" stack
# constraint in CLAUDE.md. Litestream and Caddy run as separate services in
# docker-compose.yml, sharing a volume / proxying to this container.

FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @baez/app build
RUN pnpm --filter @baez/server build

FROM node:22-bookworm-slim AS runtime
WORKDIR /repo

# Keep the monorepo's relative layout so pnpm's symlinked node_modules
# (workspace packages + the .pnpm store) still resolve correctly.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/packages/engine/package.json ./packages/engine/package.json
COPY --from=build /repo/packages/engine/src ./packages/engine/src
COPY --from=build /repo/packages/server/package.json ./packages/server/package.json
COPY --from=build /repo/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /repo/packages/server/dist ./packages/server/dist
COPY --from=build /repo/packages/app/dist ./packages/server/public

WORKDIR /repo/packages/server
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
