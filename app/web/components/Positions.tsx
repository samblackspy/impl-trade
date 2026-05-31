"use client";

import { useReadClient, useWriteClient } from "@/lib/client";
import {
  BASE_PRECISION,
  fmtBase,
  fmtUsd,
  MARKETS,
  QUOTE_PRECISION,
} from "@/lib/format";
import { ensureLocalFeeSol, transactionErrorMessage } from "@/lib/tx";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";

interface Row {
  marketIndex: number;
  base: number;
  quoteEntry: number;
}

export function Positions() {
  const read = useReadClient();
  const write = useWriteClient();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyMarket, setBusyMarket] = useState<number | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) {
      setRows(null);
      setCloseError(null);
      return;
    }
    try {
      const u = await read.fetchUser(publicKey);
      setRows(
        u.positions
          .filter((p) => p.baseAssetAmount.toString() !== "0")
          .map((p) => ({
            marketIndex: p.marketIndex,
            base: Number(p.baseAssetAmount.toString()),
            quoteEntry: Number(p.quoteEntryAmount.toString()),
          })),
      );
    } catch {
      setRows([]); // user account not created yet
    }
  }, [read, publicKey]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [load]);

  const close = async (mi: number) => {
    if (!write || !publicKey) return;
    setBusyMarket(mi);
    setCloseError(null);
    try {
      await ensureLocalFeeSol(connection, publicKey);
      const rowMarket = await read.fetchMarket(mi);
      await write
        .closePosition({ marketIndex: mi, priceUpdate: rowMarket.oracle })
        .rpc();
      await load();
      setCloseError(null);
    } catch (e) {
      setCloseError(await transactionErrorMessage(e, connection));
    } finally {
      setBusyMarket(null);
    }
  };

  return (
    <section className="glass-panel glass-panel-hover rounded-lg shadow-lg" aria-label="Positions">
      <div className="border-b border-border/50 px-4 py-3">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Positions
        </h2>
      </div>
      {!publicKey ? (
        <p className="px-4 py-8 text-center text-sm text-muted font-medium">
          Connect a wallet to view positions.
        </p>
      ) : rows === null ? (
        <div className="space-y-1.5 p-4" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-8 animate-pulse rounded-md bg-surface-2/60 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted font-medium">No open positions.</p>
      ) : (
        <div className="overflow-x-auto">
          {closeError && (
            <div
              className="whitespace-pre-wrap border-b border-short/20 bg-short/5 px-4 py-2.5 text-xs text-short font-medium"
              aria-live="polite"
            >
              {closeError}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted/70">
                <th className="px-4 py-2.5">Market</th>
                <th className="px-4 py-2.5">Size</th>
                <th className="px-4 py-2.5">Entry Price</th>
                <th className="px-4 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {rows.map((r) => {
                const label =
                  MARKETS.find((m) => m.index === r.marketIndex)?.symbol ??
                  `Market ${r.marketIndex}`;
                const baseHuman = Math.abs(r.base) / BASE_PRECISION;
                const quoteHuman = Math.abs(r.quoteEntry) / QUOTE_PRECISION;
                const entry = baseHuman > 0 ? quoteHuman / baseHuman : 0;
                const busy = busyMarket === r.marketIndex;
                const sideText = r.base >= 0 ? "LONG" : "SHORT";
                return (
                  <tr key={r.marketIndex} className="border-t border-border/30 hover:bg-white/[0.01] transition-colors">
                    <td className="px-4 py-3 font-sans font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{label}</span>
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          r.base >= 0 ? "bg-long/10 text-long border border-long/20" : "bg-short/10 text-short border border-short/20"
                        }`}>
                          {sideText}
                        </span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 font-bold ${r.base >= 0 ? "text-long" : "text-short"}`}>
                      {fmtBase(r.base)}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-semibold">
                      {fmtUsd(entry * QUOTE_PRECISION)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void close(r.marketIndex)}
                        disabled={busyMarket !== null || !write}
                        aria-busy={busy}
                        className="rounded border border-short/30 bg-short/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-short hover:bg-short hover:text-white hover:border-short transition-all duration-250 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-short disabled:opacity-50"
                      >
                        {busy ? "Closing" : "Close"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
