//! Keeper entrypoint: `pnpm --filter @impl-trade/keeper start` (needs a funded wallet +
//! a bootstrapped market on the target cluster).

import { makeClient } from "./config";
import { runLoop } from "./keeper";

function readIntervalMs(): number {
  const raw = process.env.KEEPER_INTERVAL_MS ?? "10000";
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(`[keeper] KEEPER_INTERVAL_MS must be a positive integer, got "${raw}"`);
  }
  return ms;
}

async function main(): Promise<void> {
  const controller = new AbortController();
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[keeper] ${signal} received; shutting down`);
    controller.abort();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  const client = makeClient();
  console.log(`[keeper] online — program ${client.programId.toBase58()}`);
  await runLoop(client, readIntervalMs(), controller.signal);
  console.log("[keeper] stopped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
