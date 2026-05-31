//! Rate-limited development-USDC faucet HTTP service. `POST /faucet {wallet}` mints USDC to the
//! wallet's ATA (creating it if needed). The loaded signer must be the mint authority (the
//! one that ran `create-usdc`). Local/dev convenience — never expose a real-value faucet.
//!
//!   RPC_URL=… ANCHOR_WALLET=… PORT=3004 pnpm --filter @impl-trade/faucet start

import { existsSync, readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const AMOUNT_USDC = Number(process.env.FAUCET_AMOUNT_USDC ?? 10_000);
const COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS ?? 60_000);
const USDC_DECIMALS = 6;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[faucet] missing required env ${name}`);
  return value;
}

function readPort(): number {
  const raw = process.env.PORT ?? "3004";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`[faucet] PORT must be a TCP port, got "${raw}"`);
  }
  return port;
}

function readPositiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[faucet] ${name} must be a positive integer`);
  }
  return value;
}

function loadKeypair(): Keypair {
  const path = requireEnv("ANCHOR_WALLET");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

function loadMint(): PublicKey {
  if (process.env.USDC_MINT) return new PublicKey(process.env.USDC_MINT);
  // Fall back to the address cached by `scripts/create-usdc`.
  const cache = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../scripts/.cache/usdc-mint.json",
  );
  if (!existsSync(cache)) {
    throw new Error("[faucet] missing required env USDC_MINT (no scripts/.cache/usdc-mint.json found)");
  }
  const { mint } = JSON.parse(readFileSync(cache, "utf8")) as { mint: string };
  return new PublicKey(mint);
}

const RPC = requireEnv("RPC_URL");
const PORT = readPort();
const faucetAmountUsdc = readPositiveInteger("FAUCET_AMOUNT_USDC", AMOUNT_USDC);
const cooldownMs = readPositiveInteger("FAUCET_COOLDOWN_MS", COOLDOWN_MS);
const connection = new Connection(RPC, "confirmed");
const authority = loadKeypair();
const mint = loadMint();
const lastClaim = new Map<string, number>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  if (now - (lastClaim.get(key) ?? 0) < cooldownMs) return true;
  lastClaim.set(key, now);
  return false;
}

async function handleFaucet(body: string, ip: string, res: ServerResponse): Promise<void> {
  try {
    const { wallet } = JSON.parse(body || "{}") as { wallet?: string };
    if (!wallet) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "missing wallet" }));
      return;
    }
    const owner = new PublicKey(wallet); // throws on bad input → 500 below
    if (rateLimited(`w:${wallet}`) || rateLimited(`ip:${ip}`)) {
      res.statusCode = 429;
      res.end(JSON.stringify({ error: "rate limited — try again in a minute" }));
      return;
    }
    const ata = await getOrCreateAssociatedTokenAccount(connection, authority, mint, owner);
    const base = BigInt(faucetAmountUsdc) * 10n ** BigInt(USDC_DECIMALS);
    const signature = await mintTo(connection, authority, mint, ata.address, authority.publicKey, base);
    res.end(JSON.stringify({ ok: true, amount: faucetAmountUsdc, ata: ata.address.toBase58(), signature }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("content-type", "application/json");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true, mint: mint.toBase58() }));
    return;
  }
  if (req.method === "POST" && req.url === "/faucet") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => void handleFaucet(body, req.socket.remoteAddress ?? "?", res));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log(`[faucet] listening on :${PORT} (mint ${mint.toBase58()})`));

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[faucet] ${signal} received; shutting down`);
  server.close((err) => {
    if (err) {
      console.error(`[faucet] shutdown failed: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
