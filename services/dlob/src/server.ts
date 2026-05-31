//! Minimal REST server for the orderbook. Endpoints:
//!   GET /health               -> { ok: true }
//!   GET /orderbook/:marketIdx -> L2 snapshot { bids, asks, ts }
//! Books are refreshed on an interval and served from the cached snapshot.

import { createServer, type Server } from "node:http";
import { ImplPerpsClient } from "@impl-trade/sdk";
import { buildBooks, type L2 } from "./book";

export function startServer(
  client: ImplPerpsClient,
  port = 3001,
  refreshMs = 3000,
): Server {
  let books = new Map<number, L2>();

  const refresh = async (): Promise<void> => {
    try {
      books = await buildBooks(client);
    } catch (e) {
      console.warn(`[dlob] refresh failed: ${(e as Error).message}`);
    }
  };
  void refresh();
  const refreshTimer = setInterval(() => void refresh(), refreshMs);

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    res.setHeader("content-type", "application/json");
    // Allow the browser frontend (a different origin/port) to read the orderbook.
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (url === "/health") {
      res.end(JSON.stringify({ ok: true, markets: books.size }));
      return;
    }
    const match = url.match(/^\/orderbook\/(\d+)$/);
    if (match) {
      const idx = Number(match[1]);
      const book = books.get(idx) ?? { marketIndex: idx, bids: [], asks: [], ts: Date.now() };
      res.end(JSON.stringify(book));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.on("close", () => clearInterval(refreshTimer));
  server.listen(port, () => console.log(`[dlob] listening on :${port}`));
  return server;
}
