//! Poll the program's recent transactions, decode emitted events from their logs, and
//! upsert into Postgres. Idempotent via (signature, log_index) primary keys, so re-scanning
//! the same window is harmless — no cursor bookkeeping needed for v1.

import type { EventParser } from "@coral-xyz/anchor";
import { type Connection, type PublicKey } from "@solana/web3.js";
import { pool } from "./db";

export async function ingestOnce(
  connection: Connection,
  programId: PublicKey,
  parser: EventParser,
): Promise<number> {
  const sigs = await connection.getSignaturesForAddress(programId, { limit: 50 });
  let inserted = 0;

  // Oldest first so time ordering is natural.
  for (const info of sigs.reverse()) {
    const tx = await connection.getTransaction(info.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    const logs = tx?.meta?.logMessages;
    if (!logs) continue;

    let logIndex = 0;
    for (const ev of parser.parseLogs(logs)) {
      await insertEvent(info.signature, logIndex++, ev.name, ev.data as Record<string, unknown>);
      inserted++;
    }
  }
  return inserted;
}

// Event data is decoded from the IDL; fields are camelCased (BN for integers, PublicKey for keys).
async function insertEvent(
  signature: string,
  logIndex: number,
  name: string,
  d: Record<string, unknown>,
): Promise<void> {
  const s = (v: unknown) => (v as { toString(): string }).toString();
  const b58 = (v: unknown) => (v as { toBase58(): string }).toBase58();

  // Anchor's EventParser camelCases event names (the IDL declares `TradeRecord`, etc.).
  if (name === "tradeRecord") {
    await pool.query(
      `insert into trades(signature,log_index,market_index,trader,is_long,is_close,base_amount,quote_amount,price,fee,ts)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing`,
      [signature, logIndex, d.marketIndex, b58(d.user), d.isLong, d.isClose,
        s(d.baseAmount), s(d.quoteAmount), s(d.price), s(d.fee), s(d.ts)],
    );
  } else if (name === "fundingRecord") {
    await pool.query(
      `insert into funding_rates(signature,log_index,market_index,rate,cumulative,mark_twap,oracle_twap,ts)
       values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
      [signature, logIndex, d.marketIndex, s(d.rate), s(d.cumulative),
        s(d.markTwap), s(d.oracleTwap), s(d.ts)],
    );
  } else if (name === "liquidationRecord") {
    await pool.query(
      `insert into liquidations(signature,log_index,market_index,trader,liquidator,base_closed,liq_fee,ts)
       values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
      [signature, logIndex, d.marketIndex, b58(d.user), b58(d.liquidator),
        s(d.baseClosed), s(d.liqFee), s(d.ts)],
    );
  }
}
