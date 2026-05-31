//! Client-side preview math — a bigint mirror of the on-chain `math/` core, used to show
//! entry price, slippage, notional, and liquidation hints in the UI without a round-trip.

import { AMM_RESERVE_PRECISION, BASE_PRECISION, MARGIN_PRECISION } from "./constants";

const abs = (x: bigint): bigint => (x < 0n ? -x : x);

export const divCeil = (a: bigint, b: bigint): bigint =>
  a === 0n ? 0n : (a - 1n) / b + 1n;

/** Mark price (PRICE_PRECISION) from raw reserves. */
export const reservePrice = (
  baseReserve: bigint,
  quoteReserve: bigint,
  peg: bigint,
): bigint => (quoteReserve * peg) / baseReserve;

/** Notional value (QUOTE_PRECISION) of a base amount at `price`. */
export const notional = (baseAmount: bigint, price: bigint): bigint =>
  (abs(baseAmount) * price) / BASE_PRECISION;

export interface SwapPreview {
  newBaseReserve: bigint;
  newQuoteReserve: bigint;
  /** Quote paid (buy) or received (sell), QUOTE_PRECISION. */
  quoteAmount: bigint;
  /** Average fill price, PRICE_PRECISION. */
  avgPrice: bigint;
}

/** Mirror of on-chain `calculate_swap` (rounds quote against the user). */
export const previewSwap = (
  baseReserve: bigint,
  quoteReserve: bigint,
  peg: bigint,
  baseAmount: bigint,
  isBuy: boolean,
): SwapPreview => {
  const k = baseReserve * quoteReserve;
  const newBaseReserve = isBuy ? baseReserve - baseAmount : baseReserve + baseAmount;
  if (newBaseReserve <= 0n) throw new Error("base amount exceeds reserves");
  const newQuoteReserve = divCeil(k, newBaseReserve);
  const delta = isBuy
    ? newQuoteReserve - quoteReserve
    : quoteReserve - newQuoteReserve;
  const quoteAmount = (delta * peg) / AMM_RESERVE_PRECISION;
  const avgPrice = (quoteAmount * BASE_PRECISION) / baseAmount;
  return { newBaseReserve, newQuoteReserve, quoteAmount, avgPrice };
};

/** Initial/maintenance margin requirement (QUOTE_PRECISION). */
export const marginRequirement = (notionalValue: bigint, marginRatio: bigint): bigint =>
  (notionalValue * marginRatio) / MARGIN_PRECISION;

/** Leverage (x, scaled by 1) = notional / collateral. Returns 0 if no collateral. */
export const leverage = (notionalValue: bigint, collateral: bigint): number =>
  collateral === 0n ? 0 : Number((notionalValue * 100n) / collateral) / 100;

/**
 * Approximate isolated liquidation price for a fresh position — a UI hint only (ignores
 * fees, funding and any other positions; the on-chain margin engine is authoritative). All
 * arguments are in human units ($ / base tokens / fraction). Returns 0 for an invalid size
 * or a non-positive result.
 *
 * Long:  liq = (size·entry − collateral) / (size·(1 − mmr))
 * Short: liq = (size·entry + collateral) / (size·(1 + mmr))
 */
export const liquidationPriceApprox = (
  isLong: boolean,
  sizeHuman: number,
  entryHuman: number,
  collateralHuman: number,
  mmrRatio: number,
): number => {
  if (sizeHuman <= 0) return 0;
  const liq = isLong
    ? (sizeHuman * entryHuman - collateralHuman) / (sizeHuman * (1 - mmrRatio))
    : (sizeHuman * entryHuman + collateralHuman) / (sizeHuman * (1 + mmrRatio));
  return liq > 0 ? liq : 0;
};
