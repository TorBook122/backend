FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/auth ./packages/auth
COPY packages/db ./packages/db
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm --filter @torbook/db exec prisma generate
RUN pnpm --filter @torbook/db... run build

FROM base AS migrate
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM base AS runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/auth ./packages/auth
COPY --from=build /app/packages/db ./packages/db
EXPOSE 3003
ENV PORT=3003
HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3003/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/db/dist/server.js"]
