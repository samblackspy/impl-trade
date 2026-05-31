//! WebSocket gateway entrypoint. Polls chain (mark + local oracle when available) + dlob
//! (orderbook) + indexer (trades) and streams per-market snapshots to subscribed clients.
//!
//!   RPC_URL=… DLOB_URL=… INDEXER_URL=… PORT=3003 pnpm --filter @impl-trade/ws-gateway start

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ImplPerpsClient, reservePrice } from "@impl-trade/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import { Gateway } from "./gateway";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[ws-gateway] missing required env ${name}`);
  return value;
}

function readPort(): number {
  const raw = process.env.PORT ?? "3003";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`[ws-gateway] PORT must be a TCP port, got "${raw}"`);
  }
  return port;
}

function readIntervalMs(): number {
  const raw = process.env.WS_INTERVAL_MS ?? "1500";
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(
      `[ws-gateway] WS_INTERVAL_MS must be a positive integer, got "${raw}"`,
    );
  }
  return ms;
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const RPC = requireEnv("RPC_URL");
  const DLOB = requireEnv("DLOB_URL");
  const INDEXER = requireEnv("INDEXER_URL");
  const intervalMs = readIntervalMs();
  const connection = new Connection(RPC, "confirmed");
  const client = new ImplPerpsClient(
    new AnchorProvider(connection, new Wallet(Keypair.generate()), {
      commitment: "confirmed",
    }),
  );
  const gw = new Gateway(readPort());
  const numMarkets = (await client.fetchState()).numMarkets;
  console.log(
    `[ws-gateway] streaming ${numMarkets} market(s) from ${RPC} every ${intervalMs}ms`,
  );

  const poller = setInterval(() => {
    if (gw.clientCount === 0) return; // nothing to do
    void (async () => {
      for (let m = 0; m < numMarkets; m++) {
        try {
          const market = await client.fetchMarket(m);
          const mark = reservePrice(
            BigInt(market.amm.baseAssetReserve.toString()),
            BigInt(market.amm.quoteAssetReserve.toString()),
            BigInt(market.amm.pegMultiplier.toString()),
          );
          const [orderbook, trades] = await Promise.all([
            fetchJson(`${DLOB}/orderbook/${m}`),
            fetchJson(`${INDEXER}/trades/${m}?limit=20`),
          ]);
          const oracle =
            "mock" in market.oracleSource
              ? (await client.fetchMockOracle(m)).price.toString()
              : null;
          gw.broadcast({
            market: m,
            mark: mark.toString(),
            oracle,
            orderbook,
            trades: Array.isArray(trades) ? trades : [],
            ts: Date.now(),
          });
        } catch {
          /* skip this market this tick */
        }
      }
    })();
  }, intervalMs);

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[ws-gateway] ${signal} received; shutting down`);
    clearInterval(poller);
    gw.close((err) => {
      if (err) {
        console.error(`[ws-gateway] shutdown failed: ${err.message}`);
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
