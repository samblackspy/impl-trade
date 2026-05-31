"use client";

import { useReadClient } from "@/lib/client";
import { fmtPrice, MARKETS } from "@/lib/format";
import { useMarketSnapshot } from "@/lib/ws";
import { useEffect, useState } from "react";

export function MarketStats({ market }: { market: number }) {
  const client = useReadClient();
  const [mark, setMark] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const m = await client.fetchMarket(market);
        const base = Number(m.amm.baseAssetReserve.toString());
        const quote = Number(m.amm.quoteAssetReserve.toString());
        const peg = Number(m.amm.pegMultiplier.toString());
        // (quote/base)*peg avoids precision loss vs quote*peg/base on large reserves.
        if (active) setMark((quote / base) * peg);
      } catch {
        if (active) setMark(null);
      }
    };
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [client, market]);

  // Prefer the live WebSocket mark (PRICE_PRECISION integer string); fall back to the poll.
  const snap = useMarketSnapshot(market);
  const live = Boolean(snap?.mark);
  const shownMark = snap?.mark ? Number(snap.mark) : mark;

  const symbol = MARKETS[market]?.symbol ?? `MKT-${market}`;
  return (
    <div className="flex items-center gap-8 border-b border-border/50 bg-surface/30 px-6 py-2.5 backdrop-blur-sm">
      <span className="font-sans text-sm font-extrabold text-foreground bg-surface-2 px-2.5 py-1 rounded border border-border/40 tracking-wider shadow-sm uppercase">
        {symbol}
      </span>
      <div>
        <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest text-muted">
          Mark price
          {live && <span className="h-2 w-2 rounded-full bg-long animate-pulse-glow" aria-label="live" />}
        </div>
        <div className="font-mono text-sm font-bold mt-0.5 text-foreground transition-all duration-200">
          {shownMark === null ? "—" : fmtPrice(shownMark)}
        </div>
      </div>
    </div>
  );
}
