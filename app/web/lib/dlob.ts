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

const DLOB_URL = process.env.NEXT_PUBLIC_DLOB_URL ?? "http://localhost:3001";

export async function fetchOrderbook(marketIndex: number): Promise<L2> {
  const res = await fetch(`${DLOB_URL}/orderbook/${marketIndex}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`DLOB responded ${res.status}`);
  return (await res.json()) as L2;
}
