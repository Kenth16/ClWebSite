# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/content/package.json packages/content/
RUN npm ci
COPY . .
RUN npm run build -w @kenpai/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/content/package.json packages/content/
RUN npm ci --omit=dev -w @kenpai/api --include-workspace-root=false
COPY --from=build /app/apps/api/dist apps/api/dist
COPY packages/db/migrations migrations
ENV MIGRATIONS_DIR=/app/migrations
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
