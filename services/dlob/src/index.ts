//! DLOB entrypoint: `pnpm --filter @impl-trade/dlob start`.

import { makeReadClient } from "./client";
import { startServer } from "./server";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[dlob] missing required env ${name}`);
  return value;
}

function readPort(): number {
  const raw = process.env.PORT ?? "3001";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`[dlob] PORT must be a TCP port, got "${raw}"`);
  }
  return port;
}

const client = makeReadClient(requireEnv("RPC_URL"));
const server = startServer(client, readPort());
console.log(`[dlob] online — program ${client.programId.toBase58()}`);

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[dlob] ${signal} received; shutting down`);
  server.close((err) => {
    if (err) {
      console.error(`[dlob] shutdown failed: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
