export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  signature: string;
  market_index: number;
  trader: string;
  is_long: boolean;
  is_close: boolean;
  base_amount: string;
  quote_amount: string;
  price: string;
  fee: string;
  ts: string;
}

const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3002";

export async function fetchCandles(market: number, resolution = 60): Promise<Candle[]> {
  const res = await fetch(
    `${INDEXER}/candles/${market}?resolution=${resolution}&limit=120`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  return (await res.json()) as Candle[];
}

export async function fetchTrades(market: number, limit = 20): Promise<Trade[]> {
  const res = await fetch(`${INDEXER}/trades/${market}?limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  return (await res.json()) as Trade[];
}

export function tradesCsvUrl(market: number): string {
  return `${INDEXER}/trades/${market}.csv`;
}

export interface Funding {
  signature: string;
  market_index: number;
  rate: string;
  cumulative: string;
  mark_twap: string;
  oracle_twap: string;
  ts: string;
}

export interface Liquidation {
  signature: string;
  market_index: number;
  trader: string;
  liquidator: string;
  base_closed: string;
  liq_fee: string;
  ts: string;
}

export async function fetchFunding(market: number, limit = 50): Promise<Funding[]> {
  const res = await fetch(`${INDEXER}/funding/${market}?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  return (await res.json()) as Funding[];
}

export async function fetchLiquidations(market: number, limit = 50): Promise<Liquidation[]> {
  const res = await fetch(`${INDEXER}/liquidations/${market}?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  return (await res.json()) as Liquidation[];
}

export function liquidationsCsvUrl(market: number): string {
  return `${INDEXER}/liquidations/${market}.csv`;
}
