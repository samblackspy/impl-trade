import { PublicKey } from "@solana/web3.js";
import { SEEDS } from "./constants";

export const deriveState = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([SEEDS.state], programId)[0];

export const deriveVaultAuthority = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([SEEDS.vaultAuthority], programId)[0];

export const deriveCollateralVault = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([SEEDS.collateralVault], programId)[0];

export const deriveInsuranceVault = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([SEEDS.insuranceVault], programId)[0];

export const deriveInsuranceFund = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([SEEDS.insuranceFund], programId)[0];

export const deriveMarket = (programId: PublicKey, marketIndex: number): PublicKey => {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(marketIndex);
  return PublicKey.findProgramAddressSync([SEEDS.market, buf], programId)[0];
};

export const deriveUser = (programId: PublicKey, authority: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([SEEDS.user, authority.toBuffer()], programId)[0];

export const deriveMockOracle = (programId: PublicKey, marketIndex: number): PublicKey => {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(marketIndex);
  return PublicKey.findProgramAddressSync([SEEDS.mockOracle, buf], programId)[0];
};
