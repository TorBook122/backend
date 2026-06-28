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
RUN pnpm --filter @torbook/auth-service... run build
RUN pnpm --filter @torbook/auth-service deploy /prod --prod
WORKDIR /prod
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN SCHEMA=$(find node_modules -path '*/@torbook/db/prisma/schema.prisma' | head -1) && \
    npx --yes prisma@5.22.0 generate --schema="$SCHEMA"

FROM base AS runtime
COPY --from=build /prod /app
WORKDIR /app
EXPOSE 3002
CMD ["node", "dist/index.js"]
