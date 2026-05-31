"use client";

import { PageHeader } from "@/components/PageHeader";
import { MARKETS } from "@/lib/format";
import {
  fetchFunding,
  fetchLiquidations,
  fetchTrades,
  liquidationsCsvUrl,
  tradesCsvUrl,
  type Funding,
  type Liquidation,
  type Trade,
} from "@/lib/indexer";
import { type ReactNode, useEffect, useState } from "react";

type Tab = "fills" | "funding" | "liquidations";

const px = (p: string) =>
  `$${(Number(p) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const base = (b: string) => (Number(b) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 });
const ts = (t: string) => new Date(Number(t) * 1000).toLocaleString();
const key = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export default function HistoryPage() {
  const [market, setMarket] = useState(0);
  const [tab, setTab] = useState<Tab>("fills");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [funding, setFunding] = useState<Funding[]>([]);
  const [liqs, setLiqs] = useState<Liquidation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [t, f, l] = await Promise.all([
          fetchTrades(market, 100),
          fetchFunding(market, 100),
          fetchLiquidations(market, 100),
        ]);
        if (active) {
          setTrades(t);
          setFunding(f);
          setLiqs(l);
          setError(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const id = setInterval(() => void load(), 6000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [market]);

  const csv = tab === "fills" ? tradesCsvUrl(market) : tab === "liquidations" ? liquidationsCsvUrl(market) : null;

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-4 pb-12">
      <PageHeader />
      <div className="py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-sans text-2xl font-black tracking-tight text-foreground bg-gradient-to-r from-foreground to-slate-400 bg-clip-text text-transparent">
            History
          </h1>
          <div className="flex gap-1.5" role="tablist" aria-label="Market">
            {MARKETS.map((m) => (
              <button
                key={m.index}
                type="button"
                onClick={() => setMarket(m.index)}
                aria-current={m.index === market ? "page" : undefined}
                className={`shrink-0 rounded-md px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  m.index === market
                    ? "bg-primary/10 text-primary border-primary/20 shadow-[0_0_12px_rgba(45,212,191,0.05)]"
                    : "bg-surface-2/30 text-muted hover:text-foreground hover:bg-surface-2/65 border-transparent"
                }`}
              >
                {m.symbol}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between border-b border-border/30 pb-2">
          <div className="flex gap-6 text-sm">
            {(["fills", "funding", "liquidations"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`relative pb-2 focus-visible:outline-none transition-all duration-200 text-xs font-bold uppercase tracking-widest ${
                  tab === t
                    ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {csv && (
            <a
              href={csv}
              className="rounded border border-border bg-surface-2/35 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-foreground hover:bg-surface-2/80 hover:border-border transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              Download CSV
            </a>
          )}
        </div>

        <section className="overflow-x-auto glass-panel glass-panel-hover rounded-lg shadow-lg mt-4">
          {error ? (
            <p className="px-4 py-12 text-center text-short font-semibold">Indexer offline — {error}</p>
          ) : tab === "fills" ? (
            <Table
              head={["Time", "Side", "Price", "Size", "Fee"]}
              rows={trades.map((t) => [
                ts(t.ts),
                <span key="s" className={`text-xs font-extrabold uppercase px-1.5 py-0.5 rounded ${
                  t.is_long ? "bg-long/10 text-long border border-long/20" : "bg-short/10 text-short border border-short/20"
                }`}>
                  {t.is_close ? "close " : ""}
                  {t.is_long ? "long" : "short"}
                </span>,
                px(t.price),
                base(t.base_amount),
                px(t.fee),
              ])}
              empty="No fills yet."
            />
          ) : tab === "funding" ? (
            <Table
              head={["Time", "Rate (1e-9)", "Mark TWAP", "Oracle TWAP"]}
              rows={funding.map((f) => [ts(f.ts), f.rate, px(f.mark_twap), px(f.oracle_twap)])}
              empty="No funding updates yet."
            />
          ) : (
            <Table
              head={["Time", "Trader", "Liquidator", "Base closed", "Fee"]}
              rows={liqs.map((l) => [ts(l.ts), key(l.trader), key(l.liquidator), base(l.base_closed), px(l.liq_fee)])}
              empty="No liquidations yet."
            />
          )}
        </section>
      </div>
    </main>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) return <p className="px-4 py-12 text-center text-muted font-medium">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] font-bold uppercase tracking-wider text-muted/70">
        <tr className="border-b border-border/30">
          {head.map((h, i) => (
            <th key={h} className={`px-4 py-2.5 font-bold ${i === 0 ? "text-left" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono text-xs">
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-border/30 hover:bg-white/[0.01] transition-colors last:border-0">
            {r.map((cell, ci) => (
              <td key={ci} className={`px-4 py-2.5 ${ci === 0 ? "text-left text-muted font-sans font-medium" : "text-right text-slate-200 font-semibold"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
