/**
 * Mock-oracle price pusher for the **local validator**. Every `INTERVAL_MS`, nudges each
 * market's `MockOracle` by a small random walk so the index price moves — which makes the
 * chart, funding, PnL and liquidation paths actually do something locally (a real Pyth feed
 * isn't available on a `solana-test-validator`).
 *
 * No-op unless the oracle mode is mock (localnet). Stop with Ctrl-C.
 *
 *   RPC_URL=http://127.0.0.1:8899 pnpm push-prices
 */
import type { BN } from "@coral-xyz/anchor"; // type only (push-prices never constructs a BN).
import { loadEnv, useMockOracle } from "./config";

const INTERVAL_MS = Number(process.env.PUSH_INTERVAL_MS ?? 2500);
/** Max per-tick move, in basis points (30 = ±0.30%). */
const MAX_STEP_BPS = Number(process.env.PUSH_STEP_BPS ?? 30);

function walk(price: BN): BN {
  // Uniform jitter in [-MAX_STEP_BPS, +MAX_STEP_BPS].
  const jitter = Math.floor((Math.random() * 2 - 1) * MAX_STEP_BPS);
  const next = price.muln(10_000 + jitter).divn(10_000);
  // Never let a mock price collapse to zero (the program rejects non-positive prices).
  return next.lten(0) ? price : next;
}

async function main(): Promise<void> {
  if (!useMockOracle()) {
    throw new Error(
      "push-prices only runs in mock-oracle mode. Point RPC_URL at a local validator " +
        "or set IMPL_ORACLE=mock.",
    );
  }

  const { client } = loadEnv();
  const state = await client.fetchState();
  const numMarkets = state.numMarkets;
  if (numMarkets === 0) {
    throw new Error("No markets initialized. Run `pnpm bootstrap` first.");
  }

  console.log(
    `Pushing mock prices for ${numMarkets} market(s) every ${INTERVAL_MS}ms ` +
      `(±${MAX_STEP_BPS}bps/tick). Ctrl-C to stop.`,
  );

  const tick = async () => {
    for (let i = 0; i < numMarkets; i++) {
      try {
        const oracle = await client.fetchMockOracle(i);
        const next = walk(oracle.price as BN);
        await client.updateMockOracle(i, next, next.divn(1000)).rpc();
        process.stdout.write(`  m${i}=${(next.toNumber() / 1e6).toFixed(2)}`);
      } catch (err) {
        process.stdout.write(`  m${i}=ERR(${err instanceof Error ? err.message : err})`);
      }
    }
    process.stdout.write("\n");
  };

  // Fire immediately, then on an interval.
  await tick();
  setInterval(() => void tick(), INTERVAL_MS);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
