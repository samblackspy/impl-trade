/**
 * Request a devnet SOL airdrop to the loaded wallet, with retry/backoff because the
 * public devnet faucet is frequently rate-limited.
 *
 *   pnpm airdrop            # default 2 SOL
 *   pnpm airdrop -- 5       # 5 SOL
 */
import { LAMPORTS_PER_SOL, type Connection, type PublicKey } from "@solana/web3.js";

import { loadEnv } from "./config";

const DEFAULT_SOL = 2;
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Airdrop `sol` to `to`, retrying with exponential backoff on faucet failures. */
export async function airdrop(
  connection: Connection,
  to: PublicKey,
  sol: number,
): Promise<void> {
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const signature = await connection.requestAirdrop(to, lamports);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Airdrop failed after ${MAX_ATTEMPTS} attempts: ${reason}. ` +
            `Devnet faucets are often dry — try https://faucet.solana.com.`,
        );
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`  airdrop attempt ${attempt} failed (${reason}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

async function main(): Promise<void> {
  const { connection, wallet } = loadEnv();
  const arg = process.argv[2];
  const sol = arg ? Number(arg) : DEFAULT_SOL;
  if (!Number.isFinite(sol) || sol <= 0) {
    throw new Error(`Invalid SOL amount: ${arg}`);
  }

  console.log(`Airdropping ${sol} SOL to ${wallet.publicKey.toBase58()} on devnet…`);
  await airdrop(connection, wallet.publicKey, sol);

  const balance = await connection.getBalance(wallet.publicKey, "confirmed");
  console.log(`Done. Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
