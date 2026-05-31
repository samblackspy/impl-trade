FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY services/keeper/package.json services/keeper/package.json
RUN pnpm install --frozen-lockfile --filter @impl-trade/keeper...

COPY packages/sdk packages/sdk
COPY services/keeper services/keeper

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@impl-trade/keeper", "start"]
