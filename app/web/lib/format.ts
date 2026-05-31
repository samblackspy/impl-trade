// Fixed-point precisions — mirror the on-chain program / SDK.
export const PRICE_PRECISION = 1_000_000;
export const BASE_PRECISION = 1_000_000_000;
export const QUOTE_PRECISION = 1_000_000;

export const MARKETS = [
  { index: 0, symbol: "SOL-PERP" },
  { index: 1, symbol: "BTC-PERP" },
  { index: 2, symbol: "ETH-PERP" },
] as const;

export type Market = (typeof MARKETS)[number];

const dp2 = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Price in PRICE_PRECISION -> "$1,234.56". */
export function fmtPrice(p: bigint | number): string {
  const n = typeof p === "bigint" ? Number(p) : p;
  return `$${dp2(n / PRICE_PRECISION)}`;
}

/** Base in BASE_PRECISION (signed ok) -> "1.2345". */
export function fmtBase(b: bigint | number): string {
  const n = typeof b === "bigint" ? Number(b) : b;
  return (n / BASE_PRECISION).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Quote in QUOTE_PRECISION -> "$1,234.56". */
export function fmtUsd(q: bigint | number): string {
  const n = typeof q === "bigint" ? Number(q) : q;
  return `$${dp2(n / QUOTE_PRECISION)}`;
}

export function shortKey(k: string): string {
  return k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k;
}
