# @impl-trade/scripts

Operational scripts for the impl.trade capstone stack. They prepare the on-chain state,
collateral mint, oracle wiring, SOL/BTC/ETH markets, local price pusher, faucet flow, and
headless smoke workflow.

## Prerequisites

- Node >= 20 and `pnpm`; run `pnpm install` from the repo root first.
- The `impl-perps` program built and available at the program id bundled in the SDK IDL.
- A funded Solana keypair. By default scripts use `~/.config/solana/id.json`; override with
  `ANCHOR_WALLET=/path/to/key.json`.
- `RPC_URL` for the target cluster. `http://127.0.0.1:8899` is used by `localnet.sh`.

Derived local addresses, including the development USDC mint, are cached under
`scripts/.cache/`. That directory is gitignored.

## Oracle Modes

- `IMPL_ORACLE=pyth`: use Pyth price-feed accounts. This is the deployed/devnet mode.
- `IMPL_ORACLE=mock`: create program-owned mock oracle accounts. This is only for local
  deterministic evaluation.
- If unset, scripts choose mock on localnet and Pyth elsewhere.

## Common Commands

Run these from the repo root unless noted.

```bash
pnpm --filter @impl-trade/scripts airdrop        # request devnet SOL for the loaded wallet
pnpm --filter @impl-trade/scripts create-usdc    # create/cache development USDC mint
pnpm --filter @impl-trade/scripts bootstrap      # initialize state + SOL/BTC/ETH markets
pnpm --filter @impl-trade/scripts faucet         # mint development USDC to a wallet
pnpm --filter @impl-trade/scripts push-prices    # update local mock oracle prices
pnpm --filter @impl-trade/scripts smoke          # headless open/close/risk smoke flow
```

For the one-command local capstone demo, prefer:

```bash
./scripts/localnet.sh verify
```

## Faucet Usage

```bash
pnpm --filter @impl-trade/scripts faucet
pnpm --filter @impl-trade/scripts faucet -- <PUBKEY>
pnpm --filter @impl-trade/scripts faucet -- <PUBKEY> 25000
```

The faucet is for development collateral only. It mints test USDC to the target wallet's ATA
and is safe to re-run.

## Bootstrapped Markets

`bootstrap` initializes:

```text
0  SOL-PERP
1  BTC-PERP
2  ETH-PERP
```

In Pyth mode, the script derives the Pyth receiver price-feed accounts for the configured
feed ids. In mock mode, it initializes local oracle PDAs seeded at the market pegs and leaves
price movement to `push-prices`.
