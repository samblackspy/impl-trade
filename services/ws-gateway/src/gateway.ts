//! WebSocket fan-out. Clients connect and `{"op":"subscribe","market":N}`; the gateway
//! pushes `{channel:"snapshot", market, mark, oracle, orderbook, trades, ts}` for their markets.

import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

export interface Snapshot {
  market: number;
  mark: string;
  oracle: string | null;
  orderbook: unknown;
  trades: unknown[];
  ts: number;
}

export class Gateway {
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly subs = new Map<WebSocket, Set<number>>();

  constructor(port: number) {
    this.server = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("content-type", "application/json");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.url === "/health") {
        res.end(JSON.stringify({ ok: true, clients: this.clientCount }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on("connection", (ws) => {
      this.subs.set(ws, new Set());
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as {
            op?: string;
            market?: number;
          };
          if (typeof msg.market !== "number") return;
          if (msg.op === "subscribe") this.subs.get(ws)?.add(msg.market);
          else if (msg.op === "unsubscribe")
            this.subs.get(ws)?.delete(msg.market);
        } catch {
          /* ignore malformed frames */
        }
      });
      ws.on("close", () => this.subs.delete(ws));
      ws.on("error", () => this.subs.delete(ws));
    });
    this.server.listen(port, () =>
      console.log(`[ws-gateway] listening on :${port}`),
    );
  }

  /** Number of connected clients (used to skip polling when nobody's listening). */
  get clientCount(): number {
    return this.subs.size;
  }

  broadcast(snap: Snapshot): void {
    const payload = JSON.stringify({ channel: "snapshot", ...snap });
    for (const [ws, markets] of this.subs) {
      if (markets.has(snap.market) && ws.readyState === WebSocket.OPEN)
        ws.send(payload);
    }
  }

  close(cb: (err?: Error) => void): void {
    for (const ws of this.subs.keys()) {
      ws.close(1001, "server shutting down");
    }
    this.wss.close((wssErr) => {
      this.server.close((serverErr) => cb(wssErr ?? serverErr ?? undefined));
    });
  }
}
