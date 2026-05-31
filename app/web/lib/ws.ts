"use client";

import { useEffect, useState } from "react";
import type { L2 } from "./dlob";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3003";
const WS_RETRY_MS = 5000;

export interface MarketSnapshot {
  market: number;
  /** Mark price as a PRICE_PRECISION integer string. */
  mark: string;
  /** Oracle/index price as a PRICE_PRECISION integer string when the gateway can read it. */
  oracle?: string | null;
  orderbook: L2 | null;
  trades: unknown[];
  ts: number;
}

/**
 * Subscribe to the ws-gateway for a market's live snapshot (mark + orderbook + trades), with
 * auto-reconnect. Returns `null` until the first frame (or if the gateway is offline — callers
 * fall back to REST polling). Browser-only.
 */
export function useMarketSnapshot(market: number): MarketSnapshot | null {
  const [snap, setSnap] = useState<MarketSnapshot | null>(null);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let probe: AbortController | undefined;

    const connect = () => {
      if (closed) return;
      if (probe) {
        try {
          probe.abort(new Error("reconnect"));
        } catch (e) {}
      }
      probe = new AbortController();
      const timeout = setTimeout(() => {
        if (probe) {
          try {
            probe.abort(new Error("timeout"));
          } catch (e) {}
        }
      }, 1200);
      void fetch(wsHealthUrl(WS_URL), {
        cache: "no-store",
        signal: probe.signal,
      })
        .then((res) => {
          clearTimeout(timeout);
          if (!res.ok || closed) throw new Error("ws-gateway offline");
          openSocket();
        })
        .catch((err) => {
          if (err?.name === "AbortError" || err?.message === "reconnect" || err?.message === "unmount") {
             // ignore intentional aborts
             return;
          }
          clearTimeout(timeout);
          if (!closed) retry = setTimeout(connect, WS_RETRY_MS);
        });
    };

    const openSocket = () => {
      if (closed) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        retry = setTimeout(connect, WS_RETRY_MS);
        return;
      }
      ws.onopen = () => ws?.send(JSON.stringify({ op: "subscribe", market }));
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data as string) as MarketSnapshot & {
            channel?: string;
          };
          if (m.channel === "snapshot" && m.market === market) setSnap(m);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, WS_RETRY_MS);
      };
      ws.onerror = () => {
        /* onclose handles reconnect; avoid closing a CONNECTING socket and logging noise */
      };
    };

    setSnap(null);
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (probe) {
        try {
          probe.abort(new Error("unmount"));
        } catch (e) {}
      }
      if (ws?.readyState === WebSocket.OPEN) ws.close();
    };
  }, [market]);

  return snap;
}

function wsHealthUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/health";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "http://localhost:3003/health";
  }
}
