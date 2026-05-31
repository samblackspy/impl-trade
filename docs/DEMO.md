# impl.trade — local demo script

A short walkthrough of the whole stack on a local validator. This uses deterministic local
oracle accounts and development USDC so the capstone can be evaluated without devnet SOL.

## 0. Bring it all up

```bash
pnpm install --frozen-lockfile    # once
anchor build                      # once
./scripts/localnet.sh verify      # validator + program + db + services + web + e2e smoke
```

When it prints **"impl.trade is live locally"**, open <http://localhost:3000>.
(Ports: web 3000 · dlob 3001 · indexer 3002 · ws-gateway 3003 · faucet 3004 · rpc 8899.)

> Tip: the local price pusher is moving SOL/BTC/ETH every ~2.5s and the keeper is cranking
> funding + matching orders continuously, so the chart, funding history, and order book are
> all live.

## 1. Onboard (≈30s)
- Connect a wallet (Phantom/Solflare/Backpack) set to **localhost / custom RPC `http://127.0.0.1:8899`**.
- In the order ticket: **Init account**, then **Claim + deposit** (the development faucet
  mints 10,000 local demo USDC and the app deposits it as protocol collateral).

## 2. Trade (≈45s)
- **Market:** Long 5 SOL-PERP → see the position appear under *Positions* with live uPnL.
- **Limit:** place a Long limit below mark and a counterparty Short limit above it from a
  second wallet — the **keeper matches them maker-vs-maker** (watch `.localnet/keeper.log`).
- Watch the **order book** "live" badge (ws-gateway push) and **Recent trades** update.

## 3. Stop-loss (≈30s)
- Open a long, then on the **stop** tab place a reduce-only trigger *below* the mark.
- It rests until the index crosses; the keeper fires `trigger_order` and the position closes
  (the headless equivalent is asserted by `pnpm --filter @impl-trade/scripts smoke`).

## 4. Risk (≈30s)
- Open a high-leverage long with little collateral; the mock price drifts down (or push it
  with `RPC_URL=http://127.0.0.1:8899 pnpm --filter @impl-trade/scripts push-prices`).
- When it crosses maintenance margin, the **keeper liquidates** it and the **insurance fund**
  takes the fee (`.localnet/keeper.log`).

## 5. Data (≈30s)
- **Portfolio** page: collateral, equity, per-market positions + uPnL.
- **History** page: fills / funding / liquidations, with **CSV** export.
- Raw APIs: `curl localhost:3002/trades/0`, `/candles/0`, `/funding/0`, `/liquidations/0`.

## The headless proof
Everything above is asserted non-interactively by the e2e smoke test (open/close,
mock-oracle liquidation + insurance-fund fee, stop-loss trigger, funding crank) — it runs at
step 5/7 of `localnet.sh verify`, and the program logic is covered by 11 unit + 20 litesvm
integration tests (`cargo test -p impl-perps`).
