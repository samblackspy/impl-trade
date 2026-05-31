//! OHLCV candles aggregated from `trades` in SQL: bucket trades by `resolution` seconds.

import { pool } from "./db";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function candles(
  market: number,
  resolution: number,
  limit: number,
): Promise<Candle[]> {
  const { rows } = await pool.query(
    `select (ts / ($2::bigint * 1000)) * $2::bigint as bucket,
            (array_agg(price order by ts asc, signature asc, log_index asc))[1]  as open,
            max(price)                              as high,
            min(price)                              as low,
            (array_agg(price order by ts desc, signature desc, log_index desc))[1] as close,
            sum(base_amount)                        as volume
       from trades
      where market_index = $1
      group by bucket
      order by bucket desc
      limit $3`,
    [market, resolution, limit],
  );
  return rows
    .map((r) => ({
      time: Number(r.bucket),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }))
    .reverse();
}
