import { PublicKey } from "@solana/web3.js";

// Fixed-point precisions — must mirror the on-chain `constants.rs`.
export const PRICE_PRECISION = 1_000_000n;
export const QUOTE_PRECISION = 1_000_000n;
export const BASE_PRECISION = 1_000_000_000n;
export const AMM_RESERVE_PRECISION = 1_000_000_000n;
export const PEG_PRECISION = 1_000_000n;
export const MARGIN_PRECISION = 10_000n;
export const FUNDING_RATE_PRECISION = 1_000_000_000n;
export const BPS_DENOMINATOR = 10_000n;

// PDA seeds — must mirror the on-chain seed constants.
export const SEEDS = {
  state: Buffer.from("state"),
  vaultAuthority: Buffer.from("vault_authority"),
  collateralVault: Buffer.from("collateral_vault"),
  insuranceVault: Buffer.from("insurance_vault"),
  insuranceFund: Buffer.from("insurance_fund"),
  market: Buffer.from("market"),
  user: Buffer.from("user"),
  mockOracle: Buffer.from("mock_oracle"),
} as const;

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
