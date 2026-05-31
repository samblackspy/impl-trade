/**
 * Shared devnet setup for the bootstrap + faucet scripts: connection, wallet, Anchor
 * provider, the SDK client, and tiny JSON helpers for the local `.cache/` directory.
 *
 * Every script imports from here so they agree on the cluster, the signer, and where
 * derived addresses (USDC mint, etc.) are persisted between runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { ImplPerpsClient } from "@impl-trade/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo `scripts/` root, regardless of where a script is invoked from. */
export const SCRIPTS_ROOT = resolve(__dirname, "..");

/** Local scratch dir for derived state (gitignored). */
export const CACHE_DIR = join(SCRIPTS_ROOT, ".cache");

/** Devnet RPC, overridable for a private/throttled endpoint (or a local validator). */
export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

/** True when pointed at a local validator. */
export function isLocalnet(): boolean {
  return /localhost|127\.0\.0\.1/.test(RPC_URL);
}

/**
 * Whether to use the program's mock oracle instead of Pyth. Defaults to mock on a local
 * validator (which has no Pyth receiver program), Pyth everywhere else. Force with
 * `IMPL_ORACLE=mock|pyth`.
 */
export function useMockOracle(): boolean {
  const m = process.env.IMPL_ORACLE;
  if (m === "mock") return true;
  if (m === "pyth") return false;
  return isLocalnet();
}

/** Default Solana CLI keypair location, used when `ANCHOR_WALLET` is unset. */
const DEFAULT_WALLET_PATH = join(homedir(), ".config", "solana", "id.json");

/** Load a JSON secret-key array (the format `solana-keygen` writes) into a Keypair. */
export function loadKeypair(path: string): Keypair {
  const raw = readFileSync(path, "utf8");
  const secret = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secret);
}

/** Resolve the signer: `ANCHOR_WALLET` env wins, else the Solana CLI default. */
export function loadWalletKeypair(): Keypair {
  const path = process.env.ANCHOR_WALLET ?? DEFAULT_WALLET_PATH;
  if (!existsSync(path)) {
    throw new Error(
      `Wallet keypair not found at ${path}. Set ANCHOR_WALLET or run \`solana-keygen new\`.`,
    );
  }
  return loadKeypair(path);
}

export interface Env {
  connection: Connection;
  wallet: Wallet;
  keypair: Keypair;
  provider: AnchorProvider;
  client: ImplPerpsClient;
}

/** Build the connection + provider + SDK client used by every script. */
export function loadEnv(): Env {
  const connection = new Connection(RPC_URL, "confirmed");
  const keypair = loadWalletKeypair();
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const client = new ImplPerpsClient(provider);
  return { connection, wallet, keypair, provider, client };
}

// ---- cache helpers ----

function cachePath(name: string): string {
  return join(CACHE_DIR, name);
}

/** Read `<name>` from `.cache/` as JSON, or `undefined` if it doesn't exist. */
export function loadCache<T>(name: string): T | undefined {
  const path = cachePath(name);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Write `value` to `.cache/<name>` as pretty JSON, creating the dir if needed. */
export function saveCache(name: string, value: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
