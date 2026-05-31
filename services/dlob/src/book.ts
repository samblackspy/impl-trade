//! Aggregate resting on-chain limit orders into an L2 orderbook per market. Bids are Long
//! limit orders (buyers), asks are Short limit orders (sellers); sizes at equal prices are
//! summed. Prices/sizes are stringified bigints (PRICE_PRECISION / BASE_PRECISION).

import { ImplPerpsClient } from "@impl-trade/sdk";

export interface Level {
  price: string;
  size: string;
}

export interface L2 {
  marketIndex: number;
  bids: Level[];
  asks: Level[];
  ts: number;
}

export async function buildBooks(client: ImplPerpsClient): Promise<Map<number, L2>> {
  const users = await client.program.account.user.all();

  const bids = new Map<number, Map<bigint, bigint>>();
  const asks = new Map<number, Map<bigint, bigint>>();

  for (const { account: user } of users) {
    for (const order of user.orders) {
      if (!("open" in order.status) || !("limit" in order.orderType)) continue;
      const remaining =
        BigInt(order.baseAssetAmount.toString()) -
        BigInt(order.baseAssetAmountFilled.toString());
      if (remaining <= 0n) continue;

      const price = BigInt(order.price.toString());
      const side = "long" in order.direction ? bids : asks;
      let book = side.get(order.marketIndex);
      if (!book) {
        book = new Map();
        side.set(order.marketIndex, book);
      }
      book.set(price, (book.get(price) ?? 0n) + remaining);
    }
  }

  const indices = new Set<number>([...bids.keys(), ...asks.keys()]);
  const result = new Map<number, L2>();
  for (const m of indices) {
    result.set(m, {
      marketIndex: m,
      bids: toLevels(bids.get(m), true),
      asks: toLevels(asks.get(m), false),
      ts: Date.now(),
    });
  }
  return result;
}

function toLevels(book: Map<bigint, bigint> | undefined, descending: boolean): Level[] {
  if (!book) return [];
  return [...book.entries()]
    .sort(([a], [b]) => (descending ? (a < b ? 1 : -1) : a > b ? 1 : -1))
    .map(([price, size]) => ({ price: price.toString(), size: size.toString() }));
}
