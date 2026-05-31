FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY services/dlob/package.json services/dlob/package.json
RUN pnpm install --frozen-lockfile --filter @impl-trade/dlob...

COPY packages/sdk packages/sdk
COPY services/dlob services/dlob

ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@impl-trade/dlob", "start"]
