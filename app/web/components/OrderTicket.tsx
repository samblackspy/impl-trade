"use client";

import { useReadClient, useWriteClient } from "@/lib/client";
import { claimUsdc } from "@/lib/faucet";
import { BASE_PRECISION, PRICE_PRECISION, QUOTE_PRECISION } from "@/lib/format";
import { associatedTokenAddress } from "@/lib/token";
import { ensureLocalFeeSol, transactionErrorMessage } from "@/lib/tx";
import {
  BN,
  liquidationPriceApprox,
  Long,
  OrderTypeTriggerMarket,
  previewSwap,
  reservePrice,
  Short,
  TriggerAbove,
  TriggerBelow,
} from "@impl-trade/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

type Side = "long" | "short";
type Kind = "market" | "limit" | "stop";
type Cond = "above" | "below";
type Status = { kind: "idle" | "pending" | "ok" | "err"; msg?: string };
interface Mkt {
  base: bigint;
  quote: bigint;
  peg: bigint;
  mmr: number; // maintenance margin ratio, as a fraction
}

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrderTicket({ market }: { market: number }) {
  const read = useReadClient();
  const write = useWriteClient();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [oracle, setOracle] = useState<PublicKey | null>(null);
  const [mkt, setMkt] = useState<Mkt | null>(null);
  const [feeBps, setFeeBps] = useState(10);
  const [collateral, setCollateral] = useState<number | null>(null);
  const [side, setSide] = useState<Side>("long");
  const [kind, setKind] = useState<Kind>("market");
  const [size, setSize] = useState("1");
  const [price, setPrice] = useState("100");
  const [trigger, setTrigger] = useState("90");
  const [cond, setCond] = useState<Cond>("below");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Market reserves (for the preview) + taker fee.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const m = await read.fetchMarket(market);
        if (!active) return;
        setOracle(m.oracle);
        setMkt({
          base: BigInt(m.amm.baseAssetReserve.toString()),
          quote: BigInt(m.amm.quoteAssetReserve.toString()),
          peg: BigInt(m.amm.pegMultiplier.toString()),
          mmr: m.marginRatioMaintenance / 10000,
        });
      } catch {
        if (active) {
          setOracle(null);
          setMkt(null);
        }
      }
      try {
        const s = await read.fetchState();
        if (active) setFeeBps(s.takerFeeBps);
      } catch {
        /* keep default fee */
      }
    };
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [read, market]);

  const loadCollateral = useCallback(async () => {
    if (!publicKey) {
      setCollateral(null);
      return;
    }
    try {
      const u = await read.fetchUser(publicKey);
      setCollateral(Number(u.collateral.toString()) / QUOTE_PRECISION);
    } catch {
      setCollateral(null);
    }
  }, [read, publicKey]);

  // The connected account's deposited collateral (for leverage + liq-price hints).
  useEffect(() => {
    if (!publicKey) {
      setCollateral(null);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const u = await read.fetchUser(publicKey);
        if (active) setCollateral(Number(u.collateral.toString()) / QUOTE_PRECISION);
      } catch {
        if (active) setCollateral(null);
      }
    };
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [read, publicKey]);

  const ensureUserAccount = async (): Promise<boolean> => {
    if (!write || !publicKey) return false;
    try {
      await read.fetchUser(publicKey);
      return false;
    } catch {
      /* create below */
    }
    try {
      await write.initializeUser().rpc();
      return true;
    } catch (e) {
      // A double-click or stale UI can race account creation. If the PDA exists now, treat
      // init as already complete and keep the user out of Anchor's raw "already in use" error.
      try {
        await read.fetchUser(publicKey);
        return false;
      } catch {
        throw e;
      }
    }
  };

  const walletCollateralBalance = async (): Promise<{ ata: PublicKey; amount: bigint }> => {
    if (!publicKey) return { ata: PublicKey.default, amount: 0n };
    const state = await read.fetchState();
    const ata = associatedTokenAddress(publicKey, state.collateralMint);
    try {
      const balance = await connection.getTokenAccountBalance(ata, "confirmed");
      return { ata, amount: BigInt(balance.value.amount) };
    } catch {
      return { ata, amount: 0n };
    }
  };

  const preview = useMemo(() => {
    const sizeHuman = Number(size);
    if (!mkt || !Number.isFinite(sizeHuman) || sizeHuman <= 0) return null;
    const isLong = side === "long";
    const mark = Number(reservePrice(mkt.base, mkt.quote, mkt.peg)) / PRICE_PRECISION;
    let entry: number;
    let impact: number | null = null;
    if (kind === "market") {
      try {
        const sw = previewSwap(
          mkt.base,
          mkt.quote,
          mkt.peg,
          BigInt(Math.round(sizeHuman * BASE_PRECISION)),
          isLong,
        );
        entry = Number(sw.avgPrice) / PRICE_PRECISION;
        impact = mark > 0 ? ((entry - mark) / mark) * (isLong ? 1 : -1) : 0;
      } catch {
        return null; // size exceeds virtual reserves
      }
    } else {
      entry = Number(kind === "limit" ? price : trigger);
    }
    if (!Number.isFinite(entry) || entry <= 0) return null;
    const notionalUsd = sizeHuman * entry;
    const fee = (notionalUsd * feeBps) / 10000;
    const lev = collateral && collateral > 0 ? notionalUsd / collateral : null;
    const liq =
      collateral != null && kind !== "stop"
        ? liquidationPriceApprox(isLong, sizeHuman, entry, collateral, mkt.mmr)
        : null;
    return { entry, impact, notionalUsd, fee, lev, liq };
  }, [mkt, size, side, kind, price, trigger, feeBps, collateral]);

  const submit = async () => {
    if (!write || !oracle || !publicKey) return;
    if (kind === "market" && (!collateral || collateral <= 0)) {
      setStatus({
        kind: "err",
        msg: "No deposited collateral. Use Claim + deposit USDC first.",
      });
      return;
    }
    setStatus({ kind: "pending" });
    try {
      const funded = await ensureLocalFeeSol(connection, publicKey);
      if (funded) setStatus({ kind: "pending", msg: "Funded local SOL for fees" });
      const baseAmount = new BN(Math.round(Number(size) * BASE_PRECISION));
      const direction = side === "long" ? Long : Short;
      if (kind === "market") {
        await write
          .openPosition({ direction, baseAmount, marketIndex: market, priceUpdate: oracle })
          .rpc();
        setStatus({ kind: "ok", msg: "Position opened" });
      } else if (kind === "limit") {
        const px = new BN(Math.round(Number(price) * PRICE_PRECISION));
        await write.placePerpOrder({ direction, baseAmount, price: px }, market).rpc();
        setStatus({ kind: "ok", msg: "Limit order placed" });
      } else {
        // Reduce-only stop-loss / take-profit; fires when the index crosses the trigger.
        const trig = new BN(Math.round(Number(trigger) * PRICE_PRECISION));
        await write
          .placePerpOrder(
            {
              direction,
              baseAmount,
              orderType: OrderTypeTriggerMarket,
              triggerPrice: trig,
              triggerCondition: cond === "above" ? TriggerAbove : TriggerBelow,
              reduceOnly: true,
            },
            market,
          )
          .rpc();
        setStatus({ kind: "ok", msg: "Stop / take-profit placed" });
      }
    } catch (e) {
      setStatus({ kind: "err", msg: await transactionErrorMessage(e, connection) });
    }
  };

  const initAccount = async () => {
    if (!write || !publicKey) return;
    setStatus({ kind: "pending", msg: "Preparing account" });
    try {
      const funded = await ensureLocalFeeSol(connection, publicKey);
      if (funded) setStatus({ kind: "pending", msg: "Funded local SOL for fees" });
      const created = await ensureUserAccount();
      await loadCollateral();
      setStatus({
        kind: "ok",
        msg: created ? "Account initialized" : "Account already initialized",
      });
    } catch (e) {
      setStatus({ kind: "err", msg: await transactionErrorMessage(e, connection) });
    }
  };

  const claim = async () => {
    if (!write || !publicKey) return;
    setStatus({ kind: "pending", msg: "Preparing account" });
    try {
      const funded = await ensureLocalFeeSol(connection, publicKey);
      if (funded) setStatus({ kind: "pending", msg: "Funded local SOL for fees" });
      const created = await ensureUserAccount();
      if (created) setStatus({ kind: "pending", msg: "Account initialized" });

      let { ata, amount } = await walletCollateralBalance();
      if (amount === 0n) {
        setStatus({ kind: "pending", msg: "Claiming development USDC" });
        const r = await claimUsdc(publicKey.toBase58());
        ata = new PublicKey(r.ata);
        amount = BigInt(Math.round(r.amount * QUOTE_PRECISION));
      }
      if (amount === 0n) throw new Error("No development USDC found to deposit.");

      setStatus({ kind: "pending", msg: "Depositing collateral" });
      await write.depositCollateral(new BN(amount.toString()), ata).rpc();
      await loadCollateral();
      setStatus({
        kind: "ok",
        msg: `Deposited ${usd(Number(amount) / QUOTE_PRECISION)} collateral`,
      });
    } catch (e) {
      setStatus({ kind: "err", msg: await transactionErrorMessage(e, connection) });
    }
  };

  const pending = status.kind === "pending";
  const verb = side === "long" ? "Long" : "Short";
  const label =
    kind === "market" ? `${verb} · market` : kind === "limit" ? `${verb} · limit` : `${verb} · stop`;

  return (
    <section className="glass-panel glass-panel-hover rounded-lg shadow-lg p-4 flex flex-col gap-4" aria-label="Order ticket">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2/60 p-1 border border-border/20">
        <button type="button" onClick={() => setSide("long")} className={tab(side === "long", "long")}>
          Long
        </button>
        <button type="button" onClick={() => setSide("short")} className={tab(side === "short", "short")}>
          Short
        </button>
      </div>

      <div className="flex gap-4 text-xs font-bold uppercase tracking-widest border-b border-border/30 pb-2">
        {(["market", "limit", "stop"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`relative pb-2 focus-visible:outline-none transition-all duration-200 ${
              kind === k
                ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
                : "text-muted hover:text-foreground"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted/80">Size</span>
        <div className="relative flex items-center">
          <input
            inputMode="decimal"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2/40 px-3 py-2 pr-14 font-mono text-sm font-semibold text-foreground placeholder:text-muted/50 focus:border-primary/50 focus:bg-surface-2 focus:ring-1 focus:ring-primary/30 focus-visible:outline-none transition-all duration-200"
          />
          <span className="absolute right-3 font-sans text-[10px] font-extrabold uppercase tracking-wider text-muted/50">
            BASE
          </span>
        </div>
      </div>

      {kind === "limit" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted/80">Limit price</span>
          <div className="relative flex items-center">
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2/40 px-3 py-2 pr-12 font-mono text-sm font-semibold text-foreground placeholder:text-muted/50 focus:border-primary/50 focus:bg-surface-2 focus:ring-1 focus:ring-primary/30 focus-visible:outline-none transition-all duration-200"
            />
            <span className="absolute right-3 font-sans text-[10px] font-extrabold uppercase tracking-wider text-muted/50">
              USD
            </span>
          </div>
        </div>
      )}

      {kind === "stop" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted/80">Trigger price</span>
            <div className="relative flex items-center">
              <input
                inputMode="decimal"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2/40 px-3 py-2 pr-12 font-mono text-sm font-semibold text-foreground placeholder:text-muted/50 focus:border-primary/50 focus:bg-surface-2 focus:ring-1 focus:ring-primary/30 focus-visible:outline-none transition-all duration-200"
              />
              <span className="absolute right-3 font-sans text-[10px] font-extrabold uppercase tracking-wider text-muted/50">
                USD
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2/60 p-1 border border-border/20">
            <button type="button" onClick={() => setCond("below")} className={condTab(cond === "below")}>
              When ≤ trigger
            </button>
            <button type="button" onClick={() => setCond("above")} className={condTab(cond === "above")}>
              When ≥ trigger
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted italic">
            Reduce-only — a keeper closes your {verb.toLowerCase()} when the index price crosses the trigger.
          </p>
        </div>
      )}

      {preview && (
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2/20 px-3 py-2.5 text-xs shadow-inner">
          <PreviewRow k="Collateral" v={collateral != null ? usd(collateral) : "Not initialized"} />
          <PreviewRow k={kind === "market" ? "Est. entry" : kind === "limit" ? "Limit" : "Trigger"} v={usd(preview.entry)} />
          {preview.impact != null && (
            <PreviewRow
              k="Price impact"
              v={`${(preview.impact * 100).toFixed(2)}%`}
              tone={preview.impact > 0.01 ? "warn" : undefined}
            />
          )}
          <PreviewRow k="Notional" v={usd(preview.notionalUsd)} />
          <PreviewRow k="Fee" v={usd(preview.fee)} />
          {preview.lev != null && <PreviewRow k="Leverage" v={`${preview.lev.toFixed(2)}×`} />}
          {preview.liq != null && preview.liq > 0 && (
            <PreviewRow k="Est. liq. price" v={usd(preview.liq)} tone="warn" />
          )}
        </dl>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!write || pending}
        className={`w-full rounded-lg py-3 text-xs font-black uppercase tracking-widest text-[#042f2e] transition-all duration-200 shadow-md hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none ${
          side === "long"
            ? "bg-long shadow-[0_4px_16px_rgba(16,185,129,0.2)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.3)]"
            : "bg-short text-white shadow-[0_4px_16px_rgba(244,63,94,0.2)] hover:shadow-[0_6px_20px_rgba(244,63,94,0.3)]"
        }`}
      >
        {!write ? "Connect wallet" : pending ? "Submitting…" : label}
      </button>

      {write && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void initAccount()} disabled={pending} className={secondaryBtn}>
            {collateral === null ? "Init account" : "Account ready"}
          </button>
          <button type="button" onClick={() => void claim()} disabled={pending} className={secondaryBtn}>
            Claim + deposit
          </button>
        </div>
      )}

      {status.kind !== "idle" && status.msg && (
        <div
          className={`rounded-md p-2 text-xs border ${
            status.kind === "err" 
              ? "text-short bg-short/5 border-short/20" 
              : "text-long bg-long/5 border-long/20"
          }`}
        >
          <p className="whitespace-pre-wrap break-words font-medium">{status.msg}</p>
        </div>
      )}
    </section>
  );
}

function PreviewRow({ k, v, tone }: { k: string; v: string; tone?: "warn" }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted font-medium">{k}</dt>
      <dd className={`font-mono font-semibold ${tone === "warn" ? "text-short font-bold" : "text-foreground"}`}>{v}</dd>
    </div>
  );
}

const secondaryBtn =
  "rounded-lg border border-border bg-surface-2/20 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-foreground hover:bg-surface-2/60 transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50 disabled:pointer-events-none";

function tab(active: boolean, side: "long" | "short"): string {
  const base =
    "rounded-md py-2 text-xs font-black uppercase tracking-widest transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  if (!active) return `${base} text-muted hover:text-foreground hover:bg-white/[0.02]`;
  return `${base} ${side === "long" ? "bg-long text-[#042f2e] shadow-[0_4px_12px_rgba(16,185,129,0.25)]" : "bg-short text-white shadow-[0_4px_12px_rgba(244,63,94,0.25)]"}`;
}

function condTab(active: boolean): string {
  const base = "rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all focus-visible:outline-none";
  return active ? `${base} bg-surface text-foreground shadow-sm border border-border/40` : `${base} text-muted hover:text-foreground border border-transparent`;
}
