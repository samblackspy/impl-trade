"use client";

import { PageHeader } from "@/components/PageHeader";
import { useReadClient } from "@/lib/client";
import { BASE_PRECISION, MARKETS, PRICE_PRECISION, QUOTE_PRECISION } from "@/lib/format";
import { reservePrice } from "@impl-trade/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

interface Row {
  symbol: string;
  baseHuman: number;
  entry: number;
  mark: number;
  uPnl: number;
  notional: number;
}

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortfolioPage() {
  const read = useReadClient();
  const { publicKey } = useWallet();
  const [collateral, setCollateral] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setCollateral(null);
      setRows([]);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const user = await read.fetchUser(publicKey);
        if (!active) return;
        setCollateral(Number(user.collateral.toString()) / QUOTE_PRECISION);

        const open = user.positions.filter((p) => p.baseAssetAmount.toString() !== "0");
        const out: Row[] = [];
        for (const pos of open) {
          const cfg = MARKETS.find((m) => m.index === pos.marketIndex);
          if (!cfg) continue;
          const market = await read.fetchMarket(pos.marketIndex);
          const mark =
            Number(
              reservePrice(
                BigInt(market.amm.baseAssetReserve.toString()),
                BigInt(market.amm.quoteAssetReserve.toString()),
                BigInt(market.amm.pegMultiplier.toString()),
              ),
            ) / PRICE_PRECISION;
          const baseHuman = Number(pos.baseAssetAmount.toString()) / BASE_PRECISION;
          const quoteEntryHuman = Number(pos.quoteEntryAmount.toString()) / QUOTE_PRECISION;
          const entry = baseHuman !== 0 ? -quoteEntryHuman / baseHuman : 0;
          out.push({
            symbol: cfg.symbol,
            baseHuman,
            entry,
            mark,
            uPnl: baseHuman * (mark - entry),
            notional: Math.abs(baseHuman) * mark,
          });
        }
        if (active) {
          setRows(out);
          setError(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [read, publicKey]);

  const totalUpnl = rows.reduce((s, r) => s + r.uPnl, 0);
  const equity = collateral !== null ? collateral + totalUpnl : null;

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-4 pb-12">
      <PageHeader />
      <div className="py-6">
        <h1 className="mb-6 font-sans text-2xl font-black tracking-tight text-foreground bg-gradient-to-r from-foreground to-slate-400 bg-clip-text text-transparent">
          Portfolio
        </h1>

        {!publicKey ? (
          <div className="glass-panel rounded-lg p-12 text-center shadow-lg">
            <p className="text-muted font-medium">Connect a wallet to view your account details.</p>
          </div>
        ) : error ? (
          <div className="glass-panel rounded-lg p-8 text-center border-short/20 shadow-lg">
            <p className="text-short font-semibold">
              Couldn&apos;t load account — {error}. Please initialize your account on the Trade page first.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Collateral" value={collateral !== null ? usd(collateral) : "—"} />
              <Stat
                label="Unrealized PnL"
                value={usd(totalUpnl)}
                tone={totalUpnl >= 0 ? "long" : "short"}
              />
              <Stat label="Equity" value={equity !== null ? usd(equity) : "—"} />
            </div>

            <section className="mt-6 glass-panel glass-panel-hover rounded-lg shadow-lg overflow-hidden" aria-label="Open positions">
              <div className="border-b border-border/50 px-4 py-3">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  Open positions
                </h2>
              </div>
              {rows.length === 0 ? (
                <p className="px-4 py-12 text-center text-muted font-medium">No open positions.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-muted/70 border-b border-border/30">
                        <th className="px-4 py-3 text-left font-medium">Market</th>
                        <th className="px-4 py-3 text-right font-medium">Side</th>
                        <th className="px-4 py-3 text-right font-medium">Size</th>
                        <th className="px-4 py-3 text-right font-medium">Entry Price</th>
                        <th className="px-4 py-3 text-right font-medium">Mark Price</th>
                        <th className="px-4 py-3 text-right font-medium">Notional</th>
                        <th className="px-4 py-3 text-right font-medium">uPnL</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {rows.map((r) => (
                        <tr key={r.symbol} className="border-b border-border/30 hover:bg-white/[0.01] transition-colors last:border-0">
                          <td className="px-4 py-3 text-left font-sans font-bold text-foreground">{r.symbol}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              r.baseHuman >= 0 ? "bg-long/10 text-long border border-long/20" : "bg-short/10 text-short border border-short/20"
                            }`}>
                              {r.baseHuman >= 0 ? "Long" : "Short"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-300">{Math.abs(r.baseHuman).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{usd(r.entry)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{usd(r.mark)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{usd(r.notional)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${r.uPnl >= 0 ? "text-long" : "text-short"}`}>
                            {usd(r.uPnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  return (
    <div className="glass-panel glass-panel-hover rounded-lg shadow-md p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted/85">{label}</div>
      <div
        className={`mt-2 font-mono text-xl font-bold tracking-tight ${
          tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
