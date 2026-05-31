FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY services/ws-gateway/package.json services/ws-gateway/package.json
RUN pnpm install --frozen-lockfile --filter @impl-trade/ws-gateway...

COPY packages/sdk packages/sdk
COPY services/ws-gateway services/ws-gateway

ENV NODE_ENV=production
EXPOSE 3003
CMD ["pnpm", "--filter", "@impl-trade/ws-gateway", "start"]
