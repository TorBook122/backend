FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS build
RUN apk add --no-cache python3 make g++ openssl
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm --filter @torbook/db exec prisma generate
RUN pnpm -r run build

FROM base AS migrate
COPY --from=build /app ./
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM base AS api
COPY --from=build /app ./
EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]

FROM base AS worker
COPY --from=build /app ./
CMD ["node", "packages/queue/dist/worker.js"]
