"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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

/** Header for the non-trade pages (no market selector). */
export function PageHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-surface/80 backdrop-blur-md px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            className="shrink-0 bg-gradient-to-r from-primary to-emerald-400 bg-clip-text font-sans text-xl font-black tracking-tight text-transparent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            impl.trade
          </Link>
          <div className="min-w-0 overflow-x-auto">
            <NavLinks />
          </div>
        </div>
        <div className="shrink-0">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
