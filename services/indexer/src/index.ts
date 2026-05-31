//! Indexer entrypoint: migrate the schema, serve the history API, and continuously ingest
//! emitted events into Postgres.
//!
//!   DATABASE_URL=postgres://… RPC_URL=… pnpm --filter @impl-trade/indexer start

import { AnchorProvider, EventParser, Wallet } from "@coral-xyz/anchor";
import { ImplPerpsClient } from "@impl-trade/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import type { Server } from "node:http";
import { startApi } from "./api";
import { closePool, migrate } from "./db";
import { ingestOnce } from "./ingest";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[indexer] missing required env ${name}`);
  return value;
}

function readPort(): number {
  const raw = process.env.PORT ?? "3002";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`[indexer] PORT must be a TCP port, got "${raw}"`);
  }
  return port;
}

function makeClient(): ImplPerpsClient {
  const connection = new Connection(requireEnv("RPC_URL"), "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), {
    commitment: "confirmed",
  });
  return new ImplPerpsClient(provider);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function installShutdown(server: Server, controller: AbortController): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[indexer] ${signal} received; shutting down`);
    controller.abort();
    server.close((serverErr) => {
      void closePool()
        .then(() => {
          if (serverErr) {
            console.error(`[indexer] shutdown failed: ${serverErr.message}`);
            process.exit(1);
          }
          process.exit(0);
        })
        .catch((poolErr: unknown) => {
          console.error(`[indexer] database shutdown failed: ${(poolErr as Error).message}`);
          process.exit(1);
        });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

async function main(): Promise<void> {
  await migrate();

  const client = makeClient();
  const parser = new EventParser(client.programId, client.program.coder);
  const controller = new AbortController();
  const api = startApi(readPort());
  installShutdown(api, controller);
  console.log(`[indexer] ingesting events for ${client.programId.toBase58()}`);

  while (!controller.signal.aborted) {
    try {
      const n = await ingestOnce(client.provider.connection, client.programId, parser);
      if (n > 0) console.log(`[indexer] +${n} events`);
    } catch (e) {
      console.error(`[indexer] ${(e as Error).message}`);
    }
    await sleep(4000, controller.signal);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
