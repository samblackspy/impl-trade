"use client";

import { fetchOrderbook, type L2, type Level } from "@/lib/dlob";
import { fmtBase, fmtPrice } from "@/lib/format";
import { useMarketSnapshot } from "@/lib/ws";
import { useEffect, useState } from "react";

export function Orderbook({ market }: { market: number }) {
  const [book, setBook] = useState<L2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const b = await fetchOrderbook(market);
        if (active) {
          setBook(b);
          setError(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    // Poll as a fallback; if the ws-gateway is up, its push takes precedence below.
    const id = setInterval(() => void load(), 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [market]);

  // Prefer the live WebSocket snapshot; fall back to the REST-polled book.
  const wsSnap = useMarketSnapshot(market);
  const live = Boolean(wsSnap?.orderbook);
  const shown = wsSnap?.orderbook ?? book;
  const empty = shown && shown.bids.length === 0 && shown.asks.length === 0;

  return (
    <section className="glass-panel glass-panel-hover rounded-lg shadow-lg" aria-label="Order book">
      <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted">Order book</h2>
        {live && (
          <span className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest text-long animate-pulse" aria-label="live">
            <span className="h-1.5 w-1.5 rounded-full bg-long animate-pulse-glow" /> live
          </span>
        )}
      </div>
      <div className="p-2 font-mono text-xs">
        {loading && !shown ? (
          <Skeleton />
        ) : !shown && error ? (
          <p className="px-1 py-8 text-center text-short font-medium">DLOB offline — {error}</p>
        ) : !shown || empty ? (
          <p className="px-1 py-8 text-center text-muted font-medium">No resting orders.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between px-2 text-[9px] font-bold uppercase tracking-wider text-muted/60 border-b border-border/30 pb-1">
              <span>Price (USD)</span>
              <span>Size</span>
            </div>
            <div className="space-y-2">
              <Side levels={shown.asks.slice(0, 8).reverse()} side="ask" />
              <div className="border-t border-border/20 my-1" />
              <Side levels={shown.bids.slice(0, 8)} side="bid" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Side({ levels, side }: { levels: Level[]; side: "bid" | "ask" }) {
  if (levels.length === 0) return <p className="px-2 py-1 text-muted text-center italic">—</p>;
  
  // Compute cumulative sizes for depth visualization
  let runningTotal = 0;
  const levelsWithCumulative = levels.map((l) => {
    runningTotal += Number(l.size);
    return { ...l, cumulative: runningTotal };
  });
  
  const maxCumulative = runningTotal > 0 ? runningTotal : 1;

  return (
    <div className="flex flex-col">
      {levelsWithCumulative.map((l, i) => {
        const percentage = Math.min(100, (l.cumulative / maxCumulative) * 100);
        return (
          <div 
            key={`${side}-${i}`} 
            className="group relative flex justify-between px-2 py-0.5 text-xs transition-colors hover:bg-white/[0.02]"
          >
            {/* Visual depth fill bar */}
            <div
              className={`absolute top-0 bottom-0 right-0 z-0 pointer-events-none transition-all duration-200 ${
                side === "bid" ? "bg-long/10" : "bg-short/10"
              }`}
              style={{ width: `${percentage}%` }}
            />
            <span className={`relative z-10 font-bold ${side === "bid" ? "text-long" : "text-short"}`}>
              {fmtPrice(BigInt(l.price))}
            </span>
            <span className="relative z-10 font-medium text-slate-300 group-hover:text-foreground">
              {fmtBase(BigInt(l.size))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-surface-2 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
