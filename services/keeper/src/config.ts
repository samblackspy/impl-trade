//! Keeper connection + wallet wiring. Requires RPC_URL and ANCHOR_WALLET on startup.

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ImplPerpsClient } from "@impl-trade/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[keeper] missing required env ${name}`);
  return value;
}

export function loadKeypair(): Keypair {
  const path = requireEnv("ANCHOR_WALLET");
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function makeClient(): ImplPerpsClient {
  const connection = new Connection(requireEnv("RPC_URL"), "confirmed");
  const wallet = new Wallet(loadKeypair());
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new ImplPerpsClient(provider);
}
