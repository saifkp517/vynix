# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app/server
RUN corepack enable
COPY server/pnpm-lock.yaml server/package.json server/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app/server
RUN corepack enable
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ .
COPY shared/ /app/shared/
RUN pnpm build

# ---- prod-deps ----
FROM node:22-alpine AS prod-deps
WORKDIR /app/server
RUN corepack enable
COPY server/pnpm-lock.yaml server/package.json server/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --config.dangerouslyAllowAllBuilds=true

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY server/package.json ./
USER app
EXPOSE 4000
CMD ["node", "dist/server/src/main"]
