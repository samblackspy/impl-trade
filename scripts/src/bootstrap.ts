/**
 * One-shot devnet bootstrap for the impl.trade perps program:
 *   1. `initialize_state` — global config + collateral/insurance vaults.
 *   2. `initialize_market` — SOL/BTC/ETH perp markets wired to Pyth or local oracles.
 *
 * Idempotent: each step is skipped if the target PDA already exists, so re-running after a
 * partial failure is safe. Requires `create-usdc` to have run first (reads the cached mint).
 *
 *   pnpm bootstrap
 */
import { getPriceFeedAccountForProgram } from "@pythnetwork/pyth-solana-receiver";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  BN,
  deriveCollateralVault,
  deriveInsuranceFund,
  deriveInsuranceVault,
  deriveMarket,
  deriveMockOracle,
  deriveState,
  deriveVaultAuthority,
  OracleSourceMock,
  OracleSourcePyth,
  TOKEN_PROGRAM_ID,
} from "@impl-trade/sdk";

import { loadEnv, useMockOracle } from "./config";
import { loadUsdcMint } from "./create-usdc";

/** Pyth push-oracle shard used for the canonical price-feed account. */
const PYTH_SHARD_ID = 0;

/** Markets to bootstrap. Pyth feed ids (32-byte hex) are identical across clusters. */
const MARKETS = [
  {
    name: "SOL-PERP",
    feedHex: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    peg: new BN(150).mul(new BN(1_000_000)), // ~$150
  },
  {
    name: "BTC-PERP",
    feedHex: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    peg: new BN(50_000).mul(new BN(1_000_000)), // ~$50k
  },
  {
    name: "ETH-PERP",
    feedHex: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    peg: new BN(3_000).mul(new BN(1_000_000)), // ~$3k
  },
];

/** Pad an ASCII name into a fixed `[u8; N]` byte array (zero-filled on the right). */
function padName(name: string, length: number): number[] {
  const bytes = Buffer.alloc(length);
  const written = Buffer.from(name, "utf8");
  if (written.length > length) {
    throw new Error(`Market name "${name}" exceeds ${length} bytes`);
  }
  written.copy(bytes);
  return Array.from(bytes);
}

async function main(): Promise<void> {
  const { client, wallet } = loadEnv();
  const program = client.program;
  const programId = program.programId;

  const collateralMint = loadUsdcMint();
  if (!collateralMint) {
    throw new Error(
      "No development USDC mint cached. Run `pnpm create-usdc` before bootstrapping.",
    );
  }

  // ---- shared PDAs ----
  const state = deriveState(programId);
  const vaultAuthority = deriveVaultAuthority(programId);
  const collateralVault = deriveCollateralVault(programId);
  const insuranceVault = deriveInsuranceVault(programId);
  const insuranceFund = deriveInsuranceFund(programId);

  console.log(`Program:    ${programId.toBase58()}`);
  console.log(`Admin:      ${wallet.publicKey.toBase58()}`);
  console.log(`Collateral: ${collateralMint.toBase58()} (development USDC)`);

  // ---- 1. initialize_state ----
  try {
    await client.fetchState();
    console.log(`State already initialized at ${state.toBase58()}; skipping.`);
  } catch {
    console.log("Initializing global state…");
    const sig = await program.methods
      .initializeState({
        takerFeeBps: 10,
        makerRebateBps: 0,
        liquidationFeeBps: 50,
      })
      .accountsPartial({
        state,
        vaultAuthority,
        collateralMint,
        collateralVault,
        insuranceVault,
        insuranceFund,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`  state ${state.toBase58()} (tx ${sig})`);
  }

  // ---- 2. initialize_market for each configured market ----
  const mock = useMockOracle();
  console.log(`Oracle source: ${mock ? "MOCK (local/dev)" : "Pyth"}`);

  for (const [i, cfg] of MARKETS.entries()) {
    const market = deriveMarket(programId, i);
    const feedId = Buffer.from(cfg.feedHex, "hex");

    // Pick the oracle account + source. On localnet there is no Pyth receiver program, so
    // we create a program-owned mock oracle seeded at the market's peg and point the market
    // at it; a price pusher (`pnpm push-prices`) then keeps it moving.
    let oracle: PublicKey;
    if (mock) {
      oracle = deriveMockOracle(programId, i);
      try {
        await client.fetchMockOracle(i);
        console.log(`  mock oracle ${i} already exists; skipping init.`);
      } catch {
        const sig = await client
          .initializeMockOracle(i, cfg.peg, cfg.peg.divn(1000))
          .rpc();
        console.log(`  mock oracle ${i} ${oracle.toBase58()} @ ${cfg.peg.toString()} (tx ${sig})`);
      }
    } else {
      oracle = getPriceFeedAccountForProgram(PYTH_SHARD_ID, feedId);
    }

    try {
      await client.fetchMarket(i);
      console.log(`Market ${i} (${cfg.name}) already initialized; skipping.`);
      continue;
    } catch {
      // not initialized yet — fall through to create it
    }

    console.log(`Initializing market ${i} (${cfg.name}) — oracle ${oracle.toBase58()}…`);
    const sig = await program.methods
      .initializeMarket({
        marketIndex: i,
        oracle,
        oracleSource: mock ? OracleSourceMock : OracleSourcePyth,
        // feedId is only consulted for the Pyth source; mock markets leave it zeroed.
        feedId: mock ? Array(32).fill(0) : Array.from(feedId),
        name: padName(cfg.name, 16), // [u8; 16]
        pegMultiplier: cfg.peg,
        ammReserve: new BN(1_000_000).mul(new BN(1_000_000_000)),
        marginRatioInitial: 1000,
        marginRatioMaintenance: 500,
        maxLeverage: 10,
        minOrderBase: new BN(1_000_000),
        maxOpenInterest: new BN(0),
        liquidationFeeBps: 50,
        fundingPeriod: new BN(3600),
      })
      .accountsPartial({
        state,
        market,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`  market ${i} ${market.toBase58()} (tx ${sig})`);
  }

  console.log("Bootstrap complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
