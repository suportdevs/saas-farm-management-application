# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t herdsphere-api .
FROM node:22-alpine AS base
WORKDIR /app
# Workspace manifests (all are needed for `npm ci` to validate the lockfile)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/

FROM base AS build
RUN npm ci -w @kit/api --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @kit/api

FROM base AS runner
ENV NODE_ENV=production
RUN npm ci -w @kit/api --omit=dev --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Apply pending migrations, then start. For multi-instance deployments, run
# `node dist/db/migrate.js` as a separate release step instead.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
