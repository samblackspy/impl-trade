/**
 * Mint development USDC to a target wallet's associated token account, creating the ATA if it
 * doesn't exist. The loaded wallet must be the mint authority (i.e. the one that ran
 * `create-usdc`).
 *
 *   pnpm faucet                       # 10,000 USDC to the loaded wallet
 *   pnpm faucet -- <PUBKEY>           # 10,000 USDC to <PUBKEY>
 *   pnpm faucet -- <PUBKEY> 25000     # 25,000 USDC to <PUBKEY>
 */
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { loadEnv } from "./config";
import { USDC_DECIMALS, loadUsdcMint } from "./create-usdc";

const DEFAULT_AMOUNT_USDC = 10_000;

/** Convert a human USDC amount to base units (bigint, no float rounding). */
function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  const [whole, frac = ""] = amount.toString().split(".");
  if (frac.length > decimals) {
    throw new Error(`Amount ${amount} has more than ${decimals} decimal places`);
  }
  const padded = frac.padEnd(decimals, "0");
  return BigInt(`${whole}${padded}`);
}

async function main(): Promise<void> {
  const { connection, keypair, wallet } = loadEnv();

  const mint = loadUsdcMint();
  if (!mint) {
    throw new Error("No development USDC mint cached. Run `pnpm create-usdc` first.");
  }

  const targetArg = process.argv[2];
  const amountArg = process.argv[3];

  const target = targetArg ? new PublicKey(targetArg) : wallet.publicKey;
  const amountUsdc = amountArg ? Number(amountArg) : DEFAULT_AMOUNT_USDC;
  const baseUnits = toBaseUnits(amountUsdc, USDC_DECIMALS);

  console.log(`Minting ${amountUsdc} development USDC to ${target.toBase58()}…`);

  // payer = loaded wallet, owner = target; creates the ATA on first use.
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair, // payer
    mint,
    target, // owner
  );

  await mintTo(
    connection,
    keypair, // payer
    mint,
    ata.address, // destination ATA
    wallet.publicKey, // mint authority
    baseUnits,
  );

  console.log(`Done. ATA: ${ata.address.toBase58()}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
