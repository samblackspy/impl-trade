//! Read-only client for the DLOB. The node only reads on-chain order accounts, so it uses
//! a throwaway wallet (it never signs).

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ImplPerpsClient } from "@impl-trade/sdk";
import { Connection, Keypair } from "@solana/web3.js";

export function makeReadClient(rpcUrl: string): ImplPerpsClient {
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new ImplPerpsClient(provider);
}
