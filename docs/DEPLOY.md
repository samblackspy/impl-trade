# Deploy impl.trade to devnet

impl.trade is a devnet/learning deployment. Do not use it for real funds or mainnet without
a professional audit, operational runbooks, and upgrade-authority controls.

## Prerequisites

- Rust stable, Anchor 0.32.1, Solana/Agave CLI 3.x, Node 20+, pnpm 11.
- A devnet keypair at `ANCHOR_WALLET` with about 3-5 SOL available for program deployment.
  The large spend is `anchor deploy` / `solana program deploy`; normal bootstrap, keeper,
  faucet, and smoke transactions use much less but still need fee SOL.
- A reliable devnet RPC endpoint. The public endpoint works for light testing but is often
  rate limited.
- Postgres 14+ for the indexer.

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export RPC_URL="https://api.devnet.solana.com"
solana config set --url "$RPC_URL" --keypair "$ANCHOR_WALLET"
solana balance
```

## 1. Build and verify locally

```bash
pnpm install --frozen-lockfile
anchor build
cargo test -p impl-perps --lib
cargo test -p impl-perps --test integration

for pkg in services/keeper services/dlob services/indexer services/ws-gateway services/faucet scripts; do
  ./node_modules/.bin/tsc -p "$pkg/tsconfig.json" --noEmit
done
```

## 2. Deploy the program

`Anchor.toml` already points the devnet provider at the frozen program id:
`BCA9Q2N8HXW48KB5hh9QFH4LT4gzyiCf4Qkx5ZwDcM5d`.

```bash
anchor deploy --provider.cluster devnet
```

Equivalent low-level command:

```bash
solana program deploy target/deploy/impl_perps.so \
  --program-id target/deploy/impl_perps-keypair.json
```

Keep the upgrade authority key offline after deployment if this is more than a demo.

## 3. Bootstrap devnet state

Run from the repo root. Off localnet, `bootstrap` uses Pyth oracles by default.

```bash
export IMPL_ORACLE=pyth
pnpm --filter @impl-trade/scripts create-usdc
pnpm --filter @impl-trade/scripts bootstrap
```

The development USDC mint is cached in `scripts/.cache/usdc-mint.json`. Record that mint address as
`USDC_MINT` for the faucet service.

## 4. Run services

Each service has a `.env.example` and Dockerfile under `services/<name>/`. Required envs:

```text
dlob:       RPC_URL, PORT
indexer:    DATABASE_URL, RPC_URL, PORT
ws-gateway: RPC_URL, DLOB_URL, INDEXER_URL, PORT, WS_INTERVAL_MS
faucet:     RPC_URL, ANCHOR_WALLET, USDC_MINT, PORT, FAUCET_AMOUNT_USDC, FAUCET_COOLDOWN_MS
keeper:     RPC_URL, ANCHOR_WALLET, KEEPER_INTERVAL_MS
```

`ANCHOR_WALLET` is a path to a JSON Solana keypair. On hosted Docker platforms, mount it as a
secret file, for example `/run/secrets/keeper-keypair.json`.

Render can use the checked-in `render.yaml`; it defines Postgres plus the four web services
and the keeper worker. Set the `sync: false` values in the Render dashboard.

Health checks:

```bash
curl https://<dlob-host>/health
curl https://<indexer-host>/health
curl https://<ws-gateway-host>/health
curl https://<faucet-host>/health
```

## 5. Deploy the web app

Use Vercel with `app/web` as the project root. The root `vercel.json` documents the required
public env vars:

```text
NEXT_PUBLIC_RPC_URL
NEXT_PUBLIC_DLOB_URL
NEXT_PUBLIC_INDEXER_URL
NEXT_PUBLIC_WS_URL
NEXT_PUBLIC_FAUCET_URL
```

Use `wss://` for `NEXT_PUBLIC_WS_URL` when the gateway is behind TLS.

## 6. Post-deploy checks

1. Open the web app and connect a devnet wallet.
2. Initialize the user account.
3. Claim development USDC from the faucet.
4. Place and close a small SOL-PERP position.
5. Confirm `/trades/0`, `/candles/0`, `/funding/0`, and `/liquidations/0` respond from the
   indexer as events arrive.
6. Confirm the keeper logs show funding cranks and no repeated startup/env failures.
