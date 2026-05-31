//! Keeper v1 — the crank that perps need. Each pass:
//!   1. updates the funding rate for every market, and
//!   2. scans every user for a liquidatable position and liquidates it.
//!
//! Health is estimated off-chain with the AMM *mark* price as a cheap proxy (no Pyth
//! parsing here); the on-chain `liquidate_perp` re-checks against the oracle and rejects
//! anything that isn't actually under water, so a false positive just wastes a tx.

import {
  BASE_PRECISION,
  ImplPerpsClient,
  MARGIN_PRECISION,
  reservePrice,
} from "@impl-trade/sdk";
import type { PublicKey } from "@solana/web3.js";

type MarketAccount = Awaited<ReturnType<ImplPerpsClient["fetchMarket"]>>;

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const isActive = (market: MarketAccount): boolean => "active" in market.status;
const canReduce = (market: MarketAccount): boolean =>
  isActive(market) || "reduceOnly" in market.status;

/** One keeper pass over all markets and users. */
export async function runOnce(client: ImplPerpsClient): Promise<void> {
  const state = await client.fetchState();
  const numMarkets = state.numMarkets;

  // 1) Crank funding for every market.
  const markets = new Map<number, MarketAccount>();
  for (let i = 0; i < numMarkets; i++) {
    const market = await client.fetchMarket(i);
    markets.set(i, market);
    try {
      await client.updateFundingRate(i, market.oracle).rpc();
      console.log(`[keeper] funding cranked: market ${i}`);
    } catch (e) {
      console.warn(`[keeper] funding crank failed (market ${i}): ${(e as Error).message}`);
    }
  }

  // 2) Scan users for liquidatable positions.
  const users = await client.program.account.user.all();
  for (const { account: user } of users) {
    for (const pos of user.positions) {
      const base = BigInt(pos.baseAssetAmount.toString());
      if (base === 0n) continue;

      const market = markets.get(pos.marketIndex);
      if (!market) continue;

      const mark = reservePrice(
        BigInt(market.amm.baseAssetReserve.toString()),
        BigInt(market.amm.quoteAssetReserve.toString()),
        BigInt(market.amm.pegMultiplier.toString()),
      );
      const quoteEntry = BigInt(pos.quoteEntryAmount.toString());
      const uPnl = (base * mark) / BASE_PRECISION + quoteEntry;
      const totalCollateral = BigInt(user.collateral.toString()) + uPnl;
      const notional = (abs(base) * mark) / BASE_PRECISION;
      const mmr = (notional * BigInt(market.marginRatioMaintenance)) / MARGIN_PRECISION;

      if (totalCollateral < mmr) {
        try {
          await client.liquidatePerp(user.authority, pos.marketIndex, market.oracle).rpc();
          console.log(
            `[keeper] liquidated ${user.authority.toBase58()} (market ${pos.marketIndex})`,
          );
        } catch (e) {
          console.warn(`[keeper] liquidation skipped: ${(e as Error).message}`);
        }
      }
    }

    // Execute crossable resting orders (mark-price proxy; the chain re-checks the
    // limit/trigger against the oracle, so a mistimed crank just reverts).
    for (const order of user.orders) {
      if (!("open" in order.status)) continue;
      const market = markets.get(order.marketIndex);
      if (!market) continue;
      const mark = reservePrice(
        BigInt(market.amm.baseAssetReserve.toString()),
        BigInt(market.amm.quoteAssetReserve.toString()),
        BigInt(market.amm.pegMultiplier.toString()),
      );

      // Trigger orders (stop-loss / take-profit): fire when the mark crosses the trigger.
      if ("triggerMarket" in order.orderType || "triggerLimit" in order.orderType) {
        if (!canReduce(market)) continue;
        const trigger = BigInt(order.triggerPrice.toString());
        const above = "above" in order.triggerCondition;
        if (above ? mark >= trigger : mark <= trigger) {
          try {
            await client
              .triggerOrder(user.authority, order.marketIndex, market.oracle, order.orderId)
              .rpc();
            console.log(`[keeper] triggered order ${order.orderId} (${user.authority.toBase58()})`);
          } catch (e) {
            console.warn(`[keeper] trigger skipped: ${(e as Error).message}`);
          }
        }
        continue;
      }

      // Resting limit orders: fill when crossed. Opening fills require Active markets;
      // reduce-only fills are also allowed in ReduceOnly markets.
      if (!("limit" in order.orderType)) continue;
      if (order.reduceOnly ? !canReduce(market) : !isActive(market)) continue;
      const isLong = "long" in order.direction;
      const limit = BigInt(order.price.toString());
      if (isLong ? mark <= limit : mark >= limit) {
        try {
          await client
            .fillPerpOrder(user.authority, order.marketIndex, market.oracle, order.orderId)
            .rpc();
          console.log(`[keeper] filled order ${order.orderId} (${user.authority.toBase58()})`);
        } catch (e) {
          console.warn(`[keeper] fill skipped: ${(e as Error).message}`);
        }
      }
    }
  }

  // 3) Maker-vs-maker: cross resting limit orders against each other (peer fills at the
  //    maker's price). Greedy best-bid/best-ask; partial fills settle over later passes.
  type Resting = { authority: PublicKey; orderId: number; isLong: boolean; price: bigint };
  const byMarket = new Map<number, Resting[]>();
  for (const { account: user } of users) {
    for (const order of user.orders) {
      if (!("open" in order.status)) continue;
      if (!("limit" in order.orderType) || order.reduceOnly) continue;
      const market = markets.get(order.marketIndex);
      if (!market || !isActive(market)) continue;
      const list = byMarket.get(order.marketIndex) ?? [];
      list.push({
        authority: user.authority,
        orderId: order.orderId,
        isLong: "long" in order.direction,
        price: BigInt(order.price.toString()),
      });
      byMarket.set(order.marketIndex, list);
    }
  }
  for (const [marketIndex, orders] of byMarket) {
    const market = markets.get(marketIndex);
    if (!market || !isActive(market)) continue;
    const bids = orders.filter((o) => o.isLong).sort((a, b) => (b.price > a.price ? 1 : -1));
    const asks = orders.filter((o) => !o.isLong).sort((a, b) => (a.price > b.price ? 1 : -1));
    let i = 0;
    let j = 0;
    while (i < bids.length && j < asks.length) {
      const bid = bids[i];
      const ask = asks[j];
      if (!bid || !ask) break;
      if (bid.authority.equals(ask.authority)) {
        j++;
        continue;
      }
      if (bid.price < ask.price) break; // best bid below best ask → no cross
      try {
        await client
          .fillPerpMatch(
            bid.authority,
            bid.orderId,
            ask.authority,
            ask.orderId,
            marketIndex,
            market.oracle,
          )
          .rpc();
        console.log(
          `[keeper] matched bid ${bid.orderId} × ask ${ask.orderId} (market ${marketIndex})`,
        );
      } catch (e) {
        console.warn(`[keeper] match skipped: ${(e as Error).message}`);
      }
      i++;
      j++;
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Run `runOnce` forever on an interval. */
export async function runLoop(
  client: ImplPerpsClient,
  intervalMs = 10_000,
  signal?: AbortSignal,
): Promise<void> {
  while (!signal?.aborted) {
    try {
      await runOnce(client);
    } catch (e) {
      console.error(`[keeper] pass error: ${(e as Error).message}`);
    }
    await sleep(intervalMs, signal);
  }
}
