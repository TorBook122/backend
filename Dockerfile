FROM node:20-alpine AS base

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

FROM base AS build

RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm --filter @torbook/db exec prisma generate
RUN pnpm -r run build

FROM base AS runtime

RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

WORKDIR /app

EXPOSE 3001

CMD ["sh", "-c", "pnpm --filter @torbook/db exec tsx scripts/repair-migrations.ts && pnpm --filter @torbook/db exec prisma migrate deploy && node packages/monolith/dist/index.js"]
