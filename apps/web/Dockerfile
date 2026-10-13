# Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:4000 -t herdsphere-web .
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/

FROM base AS build
RUN npm ci -w @kit/web --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/web apps/web
# Next.js rewrites are resolved at build time, so the API URL is a build arg.
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_APP_NAME=HerdSphere
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_AUTH_LAYOUT=split-left
ARG NEXT_PUBLIC_AUTH_YOUTUBE_ID=
ARG NEXT_PUBLIC_SALES_EMAIL=sales@herdsphere.app
ENV API_URL=$API_URL NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_AUTH_LAYOUT=$NEXT_PUBLIC_AUTH_LAYOUT NEXT_PUBLIC_AUTH_YOUTUBE_ID=$NEXT_PUBLIC_AUTH_YOUTUBE_ID NEXT_PUBLIC_SALES_EMAIL=$NEXT_PUBLIC_SALES_EMAIL NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build -w @kit/web

FROM node:22-alpine AS runner
WORKDIR /app
# API_URL is also read at runtime by server components (internal network address).
ARG API_URL=http://api:4000
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 API_URL=$API_URL
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
