"use client";

import { AnchorProvider } from "@coral-xyz/anchor";
import { ImplPerpsClient } from "@impl-trade/sdk";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  type Connection,
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { useMemo } from "react";

const DUMMY = new PublicKey("11111111111111111111111111111111");

// A non-signing wallet so we can fetch accounts before a wallet connects.
const readWallet = {
  publicKey: DUMMY,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};

function makeClient(connection: Connection, wallet: unknown): ImplPerpsClient {
  // wallet-adapter's AnchorWallet (and our read shim) satisfy Anchor's Wallet shape.
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
  });
  return new ImplPerpsClient(provider);
}

/** Client for reads (account fetches). Always available. */
export function useReadClient(): ImplPerpsClient {
  const { connection } = useConnection();
  return useMemo(() => makeClient(connection, readWallet), [connection]);
}

/** Client for signing transactions; `null` until a wallet connects. */
export function useWriteClient(): ImplPerpsClient | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  return useMemo(
    () => (wallet ? makeClient(connection, wallet) : null),
    [connection, wallet],
  );
}
