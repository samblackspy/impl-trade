import {
  type Connection,
  LAMPORTS_PER_SOL,
  type PublicKey,
} from "@solana/web3.js";

const MIN_LOCAL_SOL = 0.05 * LAMPORTS_PER_SOL;
const LOCAL_AIRDROP_SOL = 2 * LAMPORTS_PER_SOL;

export function isLocalRpc(endpoint: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])/.test(endpoint);
}

export async function ensureLocalFeeSol(
  connection: Connection,
  publicKey: PublicKey,
): Promise<boolean> {
  if (!isLocalRpc(connection.rpcEndpoint)) return false;
  const balance = await connection.getBalance(publicKey, "confirmed");
  if (balance >= MIN_LOCAL_SOL) return false;

  const signature = await connection.requestAirdrop(publicKey, LOCAL_AIRDROP_SOL);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return true;
}

export async function transactionErrorMessage(
  error: unknown,
  connection: Connection,
): Promise<string> {
  const e = error as Error & {
    logs?: string[];
    getLogs?: (connection: Connection) => Promise<string[]>;
  };
  let logs = e.logs;
  if ((!logs || logs.length === 0) && typeof e.getLogs === "function") {
    try {
      logs = await e.getLogs(connection);
    } catch {
      /* keep the original message */
    }
  }
  const message = e.message || "Transaction failed.";
  return logs && logs.length > 0 ? `${message}\n${logs.join("\n")}` : message;
}
