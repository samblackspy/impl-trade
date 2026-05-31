FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY services/faucet/package.json services/faucet/package.json
RUN pnpm install --frozen-lockfile --filter @impl-trade/faucet...

COPY services/faucet services/faucet

ENV NODE_ENV=production
EXPOSE 3004
CMD ["pnpm", "--filter", "@impl-trade/faucet", "start"]
