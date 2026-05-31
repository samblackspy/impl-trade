/**
 * Create a 6-decimal development USDC SPL mint, owned by the loaded wallet (which
 * becomes both mint and freeze authority). Idempotent: if `.cache/usdc-mint.json` already
 * points at a live mint, this re-uses it instead of minting a second one.
 *
 *   pnpm create-usdc
 */
import { pathToFileURL } from "node:url";

import { getMint, createMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { loadEnv, loadCache, saveCache } from "./config";

/** 6 decimals to mirror real USDC. */
export const USDC_DECIMALS = 6;

/** Cache file holding the derived mint address. */
export const USDC_MINT_CACHE = "usdc-mint.json";

interface UsdcMintCache {
  mint: string;
  decimals: number;
}

/** Read the cached mint address, if any. */
export function loadUsdcMint(): PublicKey | undefined {
  const cached = loadCache<UsdcMintCache>(USDC_MINT_CACHE);
  return cached ? new PublicKey(cached.mint) : undefined;
}

async function main(): Promise<void> {
  const { connection, keypair, wallet } = loadEnv();

  const cached = loadUsdcMint();
  if (cached) {
    try {
      const info = await getMint(connection, cached);
      console.log(`Development USDC mint already exists: ${cached.toBase58()}`);
      console.log(`  decimals: ${info.decimals}`);
      console.log(`  mint authority: ${info.mintAuthority?.toBase58() ?? "none"}`);
      return;
    } catch {
      console.warn(`  cached mint ${cached.toBase58()} not found on-chain; creating a new one.`);
    }
  }

  console.log(`Creating development USDC mint (authority ${wallet.publicKey.toBase58()})…`);
  const mint = await createMint(
    connection,
    keypair, // payer
    wallet.publicKey, // mint authority
    wallet.publicKey, // freeze authority
    USDC_DECIMALS,
  );

  saveCache(USDC_MINT_CACHE, { mint: mint.toBase58(), decimals: USDC_DECIMALS });
  console.log(`Created development USDC mint: ${mint.toBase58()}`);
  console.log(`  cached to .cache/${USDC_MINT_CACHE}`);
}

// Only run when invoked directly — other scripts import `loadUsdcMint`/constants from here
// and must not trigger a mint creation just by importing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
