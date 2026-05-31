/**
 * End-to-end smoke test against a **local validator** — the real proof that the whole stack
 * works locally (program + SDK + real transactions + mock oracle), with zero devnet SOL.
 *
 * Exercises every event-emitting path so the indexer has data to ingest:
 *   1. deposit → open → close          (TradeRecord ×N)
 *   2. mock-oracle-driven liquidation   (LiquidationRecord)
 *   3. funding crank                     (FundingRecord)
 *
 * Prereqs: a validator at RPC_URL with the program deployed, `create-usdc` + `bootstrap`
 * already run (mock-oracle mode). Run via `pnpm smoke` (see package.json).
 *
 * Exits non-zero on any assertion failure, so it doubles as `verify-local` in CI-style runs.
 */
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  BN,
  ImplPerpsClient,
  Long,
  OrderTypeTriggerMarket,
  Short,
  TriggerBelow,
} from "@impl-trade/sdk";

import { loadEnv, useMockOracle } from "./config";
import { loadUsdcMint } from "./create-usdc";

const USDC = (n: number) => new BN(n).mul(new BN(1_000_000));
const SOL = (n: number) => new BN(n).mul(new BN(1_000_000_000));
const PRICE = (n: number) => new BN(n).mul(new BN(1_000_000));

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main(): Promise<void> {
  if (!useMockOracle()) {
    throw new Error("smoke test requires mock-oracle mode (point RPC_URL at a local validator).");
  }

  const { connection, client: admin, keypair: adminKp, wallet: adminWallet } = loadEnv();
  const mint = loadUsdcMint();
  if (!mint) throw new Error("No development USDC mint cached. Run `pnpm create-usdc` first.");

  const market = 0;
  const oracle = admin.mockOraclePda(market);

  console.log("impl.trade — local end-to-end smoke test\n");

  // Reset the index to a known $150 so the run is deterministic.
  await admin.updateMockOracle(market, PRICE(150), PRICE(150).divn(1000)).rpc();

  // --- helper: fully provision a trader (SOL + USDC + user + deposit) ---
  async function provision(kp: Keypair, usdc: BN): Promise<{ client: ImplPerpsClient; ata: PublicKey }> {
    const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" });
    const client = new ImplPerpsClient(provider);

    if (!kp.publicKey.equals(adminWallet.publicKey)) {
      const air = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(air, "confirmed");
    }

    // admin (mint authority) funds the trader's USDC ATA.
    const ataAcct = await getOrCreateAssociatedTokenAccount(connection, adminKp, mint!, kp.publicKey);
    await mintTo(connection, adminKp, mint!, ataAcct.address, adminWallet.publicKey, BigInt(usdc.toString()));

    try {
      await client.fetchUser(kp.publicKey);
    } catch {
      await client.initializeUser(kp.publicKey).rpc();
    }
    await client.depositCollateral(usdc, ataAcct.address, kp.publicKey).rpc();
    return { client, ata: ataAcct.address };
  }

  // ===== 1. deposit → open → close lifecycle (admin) =====
  console.log("1) open/close lifecycle");
  await provision(adminKp, USDC(50_000));
  await admin.openPosition({ direction: Long, baseAmount: SOL(100), marketIndex: market, priceUpdate: oracle }).rpc();
  let user = await admin.fetchUser();
  let pos = user.positions.find((p) => p.marketIndex === market);
  assert(!!pos && (pos.baseAssetAmount as BN).gt(new BN(0)), "long position opened (base > 0)");

  await admin.closePosition({ marketIndex: market, priceUpdate: oracle }).rpc(); // full close
  user = await admin.fetchUser();
  pos = user.positions.find((p) => p.marketIndex === market);
  const adminBase = pos ? (pos.baseAssetAmount as BN) : new BN(0);
  assert(adminBase.isZero(), "position fully closed (base == 0)");

  // ===== 2. mock-oracle-driven liquidation (fresh victim) =====
  console.log("2) liquidation");
  const victim = Keypair.generate();
  const { client: victimClient } = await provision(victim, USDC(200));
  await victimClient
    .openPosition({ direction: Long, baseAmount: SOL(12), marketIndex: market, priceUpdate: oracle })
    .rpc();

  const ifBefore = await admin.program.account.insuranceFund.fetch(admin.insuranceFundPda());

  // Drop the mock index 20% → the victim's long is now under maintenance margin.
  await admin.updateMockOracle(market, PRICE(120), PRICE(120).divn(1000)).rpc();
  await admin.liquidatePerp(victim.publicKey, market, oracle, new BN(0)).rpc();

  const vUser = await admin.fetchUser(victim.publicKey);
  const vBase = vUser.positions.find((p) => p.marketIndex === market)?.baseAssetAmount as BN | undefined;
  assert(!!vBase && vBase.isZero(), "victim position liquidated (base == 0)");

  const ifAfter = await admin.program.account.insuranceFund.fetch(admin.insuranceFundPda());
  assert(
    (ifAfter.totalDeposits as BN).gt(ifBefore.totalDeposits as BN),
    "liquidation fee accrued to insurance fund",
  );

  // Restore the index so downstream services see a sane price.
  await admin.updateMockOracle(market, PRICE(150), PRICE(150).divn(1000)).rpc();

  // ===== 3. stop-loss trigger (Phase 3b) =====
  console.log("3) stop-loss trigger");
  await admin
    .openPosition({ direction: Long, baseAmount: SOL(20), marketIndex: market, priceUpdate: oracle })
    .rpc();
  const slOrderId = (await admin.fetchUser()).nextOrderId;
  await admin
    .placePerpOrder(
      {
        direction: Short,
        baseAmount: SOL(20),
        orderType: OrderTypeTriggerMarket,
        triggerPrice: PRICE(140),
        triggerCondition: TriggerBelow,
        reduceOnly: true,
      },
      market,
    )
    .rpc();
  // Index falls below the stop → the trigger crank closes the long.
  await admin.updateMockOracle(market, PRICE(135), PRICE(135).divn(1000)).rpc();
  await admin.triggerOrder(admin.wallet, market, oracle, slOrderId).rpc();
  const afterStop = await admin.fetchUser();
  const stopBase = afterStop.positions.find((p) => p.marketIndex === market)?.baseAssetAmount as
    | BN
    | undefined;
  assert(!!stopBase && stopBase.isZero(), "stop-loss closed the long when the index crossed");
  await admin.updateMockOracle(market, PRICE(150), PRICE(150).divn(1000)).rpc(); // restore

  // ===== 4. funding crank =====
  console.log("4) funding crank");
  await admin.updateFundingRate(market, oracle).rpc();
  const mkt = await admin.fetchMarket(market);
  assert(mkt.amm.lastFundingTs.toNumber() > 0, "funding rate cranked (lastFundingTs set)");

  console.log("\n✅ Local end-to-end smoke test PASSED");
}

main().catch((err) => {
  console.error("\n❌ SMOKE TEST FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
