//! History REST API:
//!   GET /health
//!   GET /trades/:market[.csv]?limit=
//!   GET /candles/:market?resolution=&limit=
//!   GET /funding/:market?limit=

import { createServer, type Server } from "node:http";
import { candles } from "./candles";
import { pool } from "./db";

export function startApi(port = 3002): Server {
  const server = createServer((req, res) => {
    // Allow the browser frontend (a different origin/port) to read the history API.
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    void handle(req.url ?? "/", res).catch((e) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: (e as Error).message }));
    });
  });
  server.listen(port, () => console.log(`[indexer] api on :${port}`));
  return server;
}

async function handle(rawUrl: string, res: import("node:http").ServerResponse): Promise<void> {
  const url = new URL(rawUrl, "http://localhost");
  const path = url.pathname;
  res.setHeader("content-type", "application/json");

  if (path === "/health") {
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const trades = path.match(/^\/trades\/(\d+)(\.csv)?$/);
  if (trades) {
    const market = Number(trades[1]);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const { rows } = await pool.query(
      "select * from trades where market_index = $1 order by ts desc limit $2",
      [market, limit],
    );
    if (trades[2]) {
      res.setHeader("content-type", "text/csv");
      res.end(toCsv(rows));
    } else {
      res.end(JSON.stringify(rows));
    }
    return;
  }

  const candle = path.match(/^\/candles\/(\d+)$/);
  if (candle) {
    const market = Number(candle[1]);
    const resolution = Number(url.searchParams.get("resolution") ?? "60");
    const limit = Number(url.searchParams.get("limit") ?? "200");
    res.end(JSON.stringify(await candles(market, resolution, limit)));
    return;
  }

  const funding = path.match(/^\/funding\/(\d+)$/);
  if (funding) {
    const market = Number(funding[1]);
    const { rows } = await pool.query(
      "select * from funding_rates where market_index = $1 order by ts desc limit 100",
      [market],
    );
    res.end(JSON.stringify(rows));
    return;
  }

  const liqs = path.match(/^\/liquidations\/(\d+)(\.csv)?$/);
  if (liqs) {
    const market = Number(liqs[1]);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const { rows } = await pool.query(
      "select * from liquidations where market_index = $1 order by ts desc limit $2",
      [market, limit],
    );
    if (liqs[2]) {
      res.setHeader("content-type", "text/csv");
      res.end(toCsv(rows));
    } else {
      res.end(JSON.stringify(rows));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
}

function toCsv(rows: Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return "";
  const cols = Object.keys(first);
  const head = cols.join(",");
  const body = rows
    .map((r) => cols.map((c) => String(r[c] ?? "")).join(","))
    .join("\n");
  return `${head}\n${body}`;
}
