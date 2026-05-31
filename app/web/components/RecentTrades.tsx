"use client";

import { fmtBase, fmtPrice } from "@/lib/format";
import { fetchTrades, type Trade, tradesCsvUrl } from "@/lib/indexer";
import { useMarketSnapshot } from "@/lib/ws";
import { useEffect, useState } from "react";

export function RecentTrades({ market }: { market: number }) {
  const [polled, setPolled] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snap = useMarketSnapshot(market);
  // Prefer the live WS feed; fall back to the REST poll.
  const wsTrades = snap?.trades as Trade[] | undefined;
  const live = Array.isArray(wsTrades) && wsTrades.length > 0;
  const trades = live ? wsTrades : polled;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const t = await fetchTrades(market);
        if (active) {
          setPolled(t);
          setError(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [market]);

  return (
    <section className="glass-panel glass-panel-hover rounded-lg shadow-lg flex-1" aria-label="Recent trades">
      <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5">
        <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
          Recent trades
          {live && <span className="h-1.5 w-1.5 rounded-full bg-long animate-pulse-glow" aria-label="live" />}
        </h2>
        <a
          href={tradesCsvUrl(market)}
          className="rounded border border-border/80 bg-surface-2/30 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-muted hover:text-foreground hover:bg-surface-2/80 hover:border-border transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          CSV
        </a>
      </div>
      <div className="p-2 font-mono text-xs">
        {error ? (
          <p className="px-1 py-6 text-center text-short font-medium">Indexer offline.</p>
        ) : !trades ? (
          <p className="px-1 py-6 text-center text-muted font-medium">Loading…</p>
        ) : trades.length === 0 ? (
          <p className="px-1 py-6 text-center text-muted font-medium">No trades yet.</p>
        ) : (
          <div>
            <div className="flex justify-between px-2 text-[9px] font-bold uppercase tracking-wider text-muted/60 border-b border-border/30 pb-1 mb-1.5">
              <span>Price (USD)</span>
              <span>Size</span>
            </div>
            <ul className="max-h-[180px] overflow-y-auto pr-0.5">
              {trades.map((t, i) => (
                <li key={`${t.signature}-${i}`} className="flex justify-between px-2 py-0.5 transition-colors hover:bg-white/[0.01]">
                  <span className={t.is_long ? "text-long font-bold" : "text-short font-bold"}>
                    {fmtPrice(BigInt(t.price))}
                  </span>
                  <span className="text-slate-300 font-medium">{fmtBase(BigInt(t.base_amount))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
