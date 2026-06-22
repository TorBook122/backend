FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/auth ./packages/auth
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @torbook/auth... run build

FROM base AS runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/auth ./packages/auth
EXPOSE 3004
ENV PORT=3004
HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3004/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/auth/dist/server.js"]
