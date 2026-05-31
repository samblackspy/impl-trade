const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET_URL ?? "http://localhost:3004";

export interface FaucetResult {
  ok: boolean;
  amount: number;
  ata: string;
  signature: string;
}

/** Request development USDC from the faucet service for `wallet`. Throws with the server message. */
export async function claimUsdc(wallet: string): Promise<FaucetResult> {
  const res = await fetch(`${FAUCET_URL}/faucet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<FaucetResult> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `faucet responded ${res.status}`);
  return json as FaucetResult;
}
