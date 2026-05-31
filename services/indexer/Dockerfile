FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY services/indexer/package.json services/indexer/package.json
RUN pnpm install --frozen-lockfile --filter @impl-trade/indexer...

COPY db db
COPY packages/sdk packages/sdk
COPY services/indexer services/indexer

ENV NODE_ENV=production
EXPOSE 3002
CMD ["pnpm", "--filter", "@impl-trade/indexer", "start"]
