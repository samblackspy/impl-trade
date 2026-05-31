"use client";

import { MARKETS } from "@/lib/format";
import dynamic from "next/dynamic";
import { NavLinks } from "./NavLinks";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => (
      <div className="h-10 w-[132px] rounded-md border border-border bg-surface-2" />
    ),
  },
);

export function TopBar({
  market,
  onMarket,
}: {
  market: number;
  onMarket: (i: number) => void;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-surface/80 backdrop-blur-md px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3 lg:flex-nowrap lg:gap-8">
          <span className="shrink-0 bg-gradient-to-r from-primary to-emerald-400 bg-clip-text font-sans text-xl font-black tracking-tight text-transparent">
            impl.trade
          </span>
          <div className="min-w-0 overflow-x-auto">
            <NavLinks />
          </div>
          <nav
            className="flex max-w-full gap-1.5 overflow-x-auto pb-1 lg:pb-0"
            aria-label="Markets"
          >
            {MARKETS.map((m) => (
              <button
                key={m.index}
                type="button"
                onClick={() => onMarket(m.index)}
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
          </nav>
        </div>
        <div className="shrink-0">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
