#!/usr/bin/env bash
# One-command local stack for impl.trade — zero devnet SOL required.
#
# Brings up, against a local solana-test-validator:
#   validator + program  ·  Postgres (impl_trade)  ·  indexer(:3002)  ·  dlob(:3001)
#   keeper  ·  mock-price pusher  ·  Next.js web(:3000)
#
# Usage:
#   ./scripts/localnet.sh          # start everything, stream logs, Ctrl-C to stop all
#   ./scripts/localnet.sh verify   # start, run the e2e smoke test, then keep running
#
# Prereqs: solana-cli + anchor, Node + pnpm (deps installed), Postgres running.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
export RPC_URL="${RPC_URL:-http://127.0.0.1:8899}"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
export DATABASE_URL="${DATABASE_URL:-postgres://localhost:5432/impl_trade}"
export IMPL_ORACLE="${IMPL_ORACLE:-mock}"

PROGRAM_ID="BCA9Q2N8HXW48KB5hh9QFH4LT4gzyiCf4Qkx5ZwDcM5d"
LOG_DIR="$ROOT/.localnet"
LEDGER="/tmp/impl-localnet-ledger"
TSX="$ROOT/scripts/node_modules/.bin/tsx"
mkdir -p "$LOG_DIR"

PIDS=()
cleanup() {
  echo ""
  echo "› shutting down…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  exit 0
}
trap cleanup INT TERM

wait_http() { # url, label, tries
  local url="$1" label="$2" tries="${3:-60}"
  for ((i=0; i<tries; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then echo "  ✓ $label"; return 0; fi
    sleep 1
  done
  echo "  ✗ $label did not come up ($url)"; return 1
}

echo "1/7 validator"
if curl -sf "$RPC_URL" -X POST -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null 2>&1; then
  echo "  ✓ already running ($RPC_URL)"
else
  rm -rf "$LEDGER"
  solana-test-validator --reset --ledger "$LEDGER" >"$LOG_DIR/validator.log" 2>&1 &
  PIDS+=("$!")
  for ((i=0; i<60; i++)); do
    curl -sf "$RPC_URL" -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null 2>&1 && break
    sleep 1
  done
  echo "  ✓ started (log: .localnet/validator.log)"
fi

echo "2/7 program + wallet"
solana config set --url "$RPC_URL" --keypair "$ANCHOR_WALLET" >/dev/null
solana airdrop 100 >/dev/null 2>&1 || true
if ! solana program show "$PROGRAM_ID" >/dev/null 2>&1; then
  solana program deploy target/deploy/impl_perps.so \
    --program-id target/deploy/impl_perps-keypair.json >/dev/null
fi
echo "  ✓ deployed $PROGRAM_ID"

echo "3/7 postgres"
createdb impl_trade 2>/dev/null && echo "  ✓ created db impl_trade" || echo "  ✓ db impl_trade ready"
psql "$DATABASE_URL" -f db/schema.sql >/dev/null
psql "$DATABASE_URL" -c "truncate trades, funding_rates, liquidations;" >/dev/null
echo "  ✓ reset indexer history for this local validator run"

echo "4/7 mint + markets (mock oracles)"
"$TSX" scripts/src/create-usdc.ts >"$LOG_DIR/setup.log" 2>&1
"$TSX" scripts/src/bootstrap.ts  >>"$LOG_DIR/setup.log" 2>&1
echo "  ✓ state + SOL/BTC/ETH markets + mock oracles (log: .localnet/setup.log)"

# Run the smoke test BEFORE the keeper/price-pusher start, so its deterministic prices
# aren't disturbed by a concurrent crank.
if [[ "${1:-}" == "verify" ]]; then
  echo "5/7 end-to-end smoke test"
  "$TSX" scripts/src/smoke.ts
else
  echo "5/7 smoke test (skipped — pass 'verify' to run it)"
fi

echo "6/7 services"
"$TSX" services/indexer/src/index.ts >"$LOG_DIR/indexer.log" 2>&1 & PIDS+=("$!")
"$TSX" services/dlob/src/index.ts    >"$LOG_DIR/dlob.log"    2>&1 & PIDS+=("$!")
"$TSX" services/keeper/src/index.ts  >"$LOG_DIR/keeper.log"  2>&1 & PIDS+=("$!")
"$TSX" scripts/src/push-prices.ts    >"$LOG_DIR/prices.log"  2>&1 & PIDS+=("$!")
DLOB_URL=http://127.0.0.1:3001 INDEXER_URL=http://127.0.0.1:3002 PORT=3003 \
  "$TSX" services/ws-gateway/src/index.ts >"$LOG_DIR/ws-gateway.log" 2>&1 & PIDS+=("$!")
"$TSX" services/faucet/src/index.ts  >"$LOG_DIR/faucet.log"  2>&1 & PIDS+=("$!")
wait_http "http://127.0.0.1:3002/health" "indexer  :3002" || true
wait_http "http://127.0.0.1:3001/health" "dlob     :3001" || true
wait_http "http://127.0.0.1:3004/health" "faucet   :3004" || true
echo "  ✓ keeper + pusher + ws-gateway(:3003) + faucet(:3004) (logs in .localnet/)"

echo "7/7 web"
# Run Next from INSIDE app/web (cwd matters: Tailwind's content scan resolves against the
# cwd, so `next dev app/web` from the repo root emits zero utility classes → unstyled UI).
( cd "$ROOT/app/web" && node_modules/.bin/next dev -p 3000 >"$LOG_DIR/web.log" 2>&1 ) & PIDS+=("$!")
wait_http "http://127.0.0.1:3000" "web      :3000" 90 || true

cat <<EOF

impl.trade is live locally:
  web       http://localhost:3000
  dlob      http://localhost:3001/orderbook/0
  indexer   http://localhost:3002/trades/0
  rpc       $RPC_URL

Logs stream to .localnet/*.log. Press Ctrl-C to stop everything.
EOF

# Keep the script alive so the trap can clean up children on Ctrl-C.
wait
