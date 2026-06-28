FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @torbook/gateway... run build
RUN pnpm --filter @torbook/gateway deploy /prod --prod

FROM base AS runtime
COPY --from=build /prod /app
WORKDIR /app
EXPOSE 3001
CMD ["node", "dist/index.js"]
