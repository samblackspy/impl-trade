import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "./bn"; // runtime-safe BN (see ./bn for why not "@coral-xyz/anchor")
import idlJson from "./idl/impl_perps.json";
import type { ImplPerps } from "./idl/impl_perps";
import { TOKEN_PROGRAM_ID } from "./constants";
import * as pdas from "./pdas";

/** Position direction, in Anchor's enum-as-object form. */
export const Long = { long: {} } as const;
export const Short = { short: {} } as const;
export type Direction = typeof Long | typeof Short;

/** Oracle source, in Anchor's enum-as-object form (mirrors `state::OracleSource`). */
export const OracleSourcePyth = { pyth: {} } as const;
export const OracleSourceMock = { mock: {} } as const;
export type OracleSource = typeof OracleSourcePyth | typeof OracleSourceMock;

/** Market status (mirrors `state::MarketStatus`). */
export const MarketStatusActive = { active: {} } as const;
export const MarketStatusReduceOnly = { reduceOnly: {} } as const;
export const MarketStatusPaused = { paused: {} } as const;
export type MarketStatus =
  | typeof MarketStatusActive
  | typeof MarketStatusReduceOnly
  | typeof MarketStatusPaused;

/** Order types (mirrors `state::OrderType`). Market never rests — it's `open_position`. */
export const OrderTypeLimit = { limit: {} } as const;
export const OrderTypeTriggerMarket = { triggerMarket: {} } as const;
export const OrderTypeTriggerLimit = { triggerLimit: {} } as const;
export type OrderType =
  | typeof OrderTypeLimit
  | typeof OrderTypeTriggerMarket
  | typeof OrderTypeTriggerLimit;

/** Trigger conditions (mirrors `state::OrderTriggerCondition`). */
export const TriggerAbove = { above: {} } as const;
export const TriggerBelow = { below: {} } as const;
export type TriggerCondition = typeof TriggerAbove | typeof TriggerBelow;

export interface OpenPositionArgs {
  direction: Direction;
  baseAmount: BN;
  priceLimit?: BN;
  marketIndex: number;
  priceUpdate: PublicKey;
}

export interface ClosePositionArgs {
  /** Omit or 0 for a full close. */
  baseAmount?: BN;
  priceLimit?: BN;
  marketIndex: number;
  priceUpdate: PublicKey;
}

/**
 * Thin, typed wrapper over the on-chain program: PDA derivation, account fetches, and
 * instruction builders. Each builder returns an Anchor `MethodsBuilder`, so callers can
 * `.rpc()`, `.transaction()`, or `.instruction()` as needed.
 */
export class ImplPerpsClient {
  readonly program: Program<ImplPerps>;

  constructor(readonly provider: AnchorProvider) {
    this.program = new Program(idlJson as ImplPerps, provider);
  }

  get programId(): PublicKey {
    return this.program.programId;
  }
  get wallet(): PublicKey {
    return this.provider.wallet.publicKey;
  }

  // ---- PDAs ----
  statePda = (): PublicKey => pdas.deriveState(this.programId);
  marketPda = (i: number): PublicKey => pdas.deriveMarket(this.programId, i);
  userPda = (authority: PublicKey = this.wallet): PublicKey =>
    pdas.deriveUser(this.programId, authority);
  vaultAuthorityPda = (): PublicKey => pdas.deriveVaultAuthority(this.programId);
  collateralVaultPda = (): PublicKey => pdas.deriveCollateralVault(this.programId);
  insuranceFundPda = (): PublicKey => pdas.deriveInsuranceFund(this.programId);
  mockOraclePda = (i: number): PublicKey => pdas.deriveMockOracle(this.programId, i);

  // ---- account fetches ----
  fetchState() {
    return this.program.account.state.fetch(this.statePda());
  }
  fetchMarket(i: number) {
    return this.program.account.market.fetch(this.marketPda(i));
  }
  fetchUser(authority: PublicKey = this.wallet) {
    return this.program.account.user.fetch(this.userPda(authority));
  }
  fetchMockOracle(i: number) {
    return this.program.account.mockOracle.fetch(this.mockOraclePda(i));
  }

  // ---- instruction builders ----
  initializeUser(authority: PublicKey = this.wallet) {
    return this.program.methods.initializeUser().accountsPartial({
      state: this.statePda(),
      user: this.userPda(authority),
      authority,
      systemProgram: SystemProgram.programId,
    });
  }

  depositCollateral(
    amount: BN,
    userTokenAccount: PublicKey,
    authority: PublicKey = this.wallet,
  ) {
    return this.program.methods.depositCollateral(amount).accountsPartial({
      state: this.statePda(),
      user: this.userPda(authority),
      authority,
      userTokenAccount,
      collateralVault: this.collateralVaultPda(),
      tokenProgram: TOKEN_PROGRAM_ID,
    });
  }

  withdrawCollateral(
    amount: BN,
    userTokenAccount: PublicKey,
    marketIndex: number,
    priceUpdate: PublicKey,
    authority: PublicKey = this.wallet,
  ) {
    return this.program.methods.withdrawCollateral(amount).accountsPartial({
      state: this.statePda(),
      user: this.userPda(authority),
      authority,
      market: this.marketPda(marketIndex),
      priceUpdate,
      collateralVault: this.collateralVaultPda(),
      vaultAuthority: this.vaultAuthorityPda(),
      userTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
  }

  openPosition(args: OpenPositionArgs, authority: PublicKey = this.wallet) {
    return this.program.methods
      .openPosition({
        direction: args.direction as never,
        baseAmount: args.baseAmount,
        priceLimit: args.priceLimit ?? new BN(0),
      })
      .accountsPartial({
        state: this.statePda(),
        user: this.userPda(authority),
        authority,
        market: this.marketPda(args.marketIndex),
        priceUpdate: args.priceUpdate,
      });
  }

  closePosition(args: ClosePositionArgs, authority: PublicKey = this.wallet) {
    return this.program.methods
      .closePosition({
        baseAmount: args.baseAmount ?? new BN(0),
        priceLimit: args.priceLimit ?? new BN(0),
      })
      .accountsPartial({
        state: this.statePda(),
        user: this.userPda(authority),
        authority,
        market: this.marketPda(args.marketIndex),
        priceUpdate: args.priceUpdate,
      });
  }

  liquidatePerp(
    userAuthority: PublicKey,
    marketIndex: number,
    priceUpdate: PublicKey,
    maxBaseAmount: BN = new BN(0),
  ) {
    return this.program.methods.liquidatePerp(maxBaseAmount).accountsPartial({
      state: this.statePda(),
      liquidator: this.wallet,
      user: this.userPda(userAuthority),
      market: this.marketPda(marketIndex),
      priceUpdate,
      insuranceFund: this.insuranceFundPda(),
    });
  }

  /// Keeper crank: refresh TWAPs + accrue funding for a market.
  updateFundingRate(marketIndex: number, priceUpdate: PublicKey) {
    return this.program.methods.updateFundingRate().accountsPartial({
      state: this.statePda(),
      market: this.marketPda(marketIndex),
      priceUpdate,
    });
  }

  /// Apply a position's accrued funding to its collateral (permissionless crank).
  settleFunding(userAuthority: PublicKey, marketIndex: number) {
    return this.program.methods.settleFunding().accountsPartial({
      state: this.statePda(),
      user: this.userPda(userAuthority),
      market: this.marketPda(marketIndex),
    });
  }

  /// Cover a bankrupt account's bad debt from the insurance fund (keeper).
  resolvePerpBankruptcy(userAuthority: PublicKey) {
    return this.program.methods.resolvePerpBankruptcy().accountsPartial({
      state: this.statePda(),
      keeper: this.wallet,
      user: this.userPda(userAuthority),
      insuranceFund: this.insuranceFundPda(),
    });
  }

  /// Rest a limit order, or a reduce-only stop-loss / take-profit (trigger) order.
  placePerpOrder(
    params: {
      direction: Direction;
      baseAmount: BN;
      price?: BN;
      orderType?: OrderType;
      triggerPrice?: BN;
      triggerCondition?: TriggerCondition;
      reduceOnly?: boolean;
      postOnly?: boolean;
    },
    marketIndex: number,
    authority: PublicKey = this.wallet,
  ) {
    return this.program.methods
      .placePerpOrder({
        orderType: (params.orderType ?? OrderTypeLimit) as never,
        direction: params.direction as never,
        baseAmount: params.baseAmount,
        price: params.price ?? new BN(0),
        triggerPrice: params.triggerPrice ?? new BN(0),
        triggerCondition: (params.triggerCondition ?? TriggerAbove) as never,
        reduceOnly: params.reduceOnly ?? false,
        postOnly: params.postOnly ?? false,
      })
      .accountsPartial({
        state: this.statePda(),
        user: this.userPda(authority),
        authority,
        market: this.marketPda(marketIndex),
      });
  }

  /// Cancel a resting order by id.
  cancelOrder(orderId: number, authority: PublicKey = this.wallet) {
    return this.program.methods.cancelOrder(orderId).accountsPartial({
      state: this.statePda(),
      user: this.userPda(authority),
      authority,
    });
  }

  /// Keeper: fill a resting limit order against the AMM.
  fillPerpOrder(
    userAuthority: PublicKey,
    marketIndex: number,
    priceUpdate: PublicKey,
    orderId: number,
  ) {
    return this.program.methods.fillPerpOrder(orderId).accountsPartial({
      state: this.statePda(),
      filler: this.wallet,
      user: this.userPda(userAuthority),
      market: this.marketPda(marketIndex),
      priceUpdate,
    });
  }

  /// Keeper: cross two resting limit orders against each other (maker-vs-maker).
  fillPerpMatch(
    takerAuthority: PublicKey,
    takerOrderId: number,
    makerAuthority: PublicKey,
    makerOrderId: number,
    marketIndex: number,
    priceUpdate: PublicKey,
  ) {
    return this.program.methods.fillPerpMatch(takerOrderId, makerOrderId).accountsPartial({
      state: this.statePda(),
      filler: this.wallet,
      taker: this.userPda(takerAuthority),
      maker: this.userPda(makerAuthority),
      market: this.marketPda(marketIndex),
      priceUpdate,
    });
  }

  /// Keeper: execute a stop-loss / take-profit when the oracle crosses its trigger.
  triggerOrder(
    userAuthority: PublicKey,
    marketIndex: number,
    priceUpdate: PublicKey,
    orderId: number,
  ) {
    return this.program.methods.triggerOrder(orderId).accountsPartial({
      state: this.statePda(),
      filler: this.wallet,
      user: this.userPda(userAuthority),
      market: this.marketPda(marketIndex),
      priceUpdate,
    });
  }

  // ---- admin: risk params + circuit breakers ----

  /// Admin: retune a market's risk params + status (Active / ReduceOnly / Paused).
  updateMarketParams(
    marketIndex: number,
    params: {
      status: MarketStatus;
      marginRatioInitial: number;
      marginRatioMaintenance: number;
      maxLeverage: number;
      minOrderBase: BN;
      maxOpenInterest: BN;
      liquidationFeeBps: number;
      fundingPeriod: BN;
    },
    admin: PublicKey = this.wallet,
  ) {
    return this.program.methods
      .updateMarketParams({
        status: params.status as never,
        marginRatioInitial: params.marginRatioInitial,
        marginRatioMaintenance: params.marginRatioMaintenance,
        maxLeverage: params.maxLeverage,
        minOrderBase: params.minOrderBase,
        maxOpenInterest: params.maxOpenInterest,
        liquidationFeeBps: params.liquidationFeeBps,
        fundingPeriod: params.fundingPeriod,
      })
      .accountsPartial({
        state: this.statePda(),
        market: this.marketPda(marketIndex),
        admin,
      });
  }

  /// Admin: global circuit breaker — pause/unpause all user-facing position changes.
  setProtocolPaused(paused: boolean, admin: PublicKey = this.wallet) {
    return this.program.methods.setProtocolPaused(paused).accountsPartial({
      state: this.statePda(),
      admin,
    });
  }

  // ---- mock oracle (local/dev only) ----

  /// Admin: create a program-owned mock price account for `marketIndex`.
  initializeMockOracle(marketIndex: number, price: BN, conf: BN, admin: PublicKey = this.wallet) {
    return this.program.methods
      .initializeMockOracle({ marketIndex, price, conf })
      .accountsPartial({
        state: this.statePda(),
        mockOracle: this.mockOraclePda(marketIndex),
        admin,
        systemProgram: SystemProgram.programId,
      });
  }

  /// Authority: push a fresh price into a mock oracle.
  updateMockOracle(marketIndex: number, price: BN, conf: BN, authority: PublicKey = this.wallet) {
    return this.program.methods.updateMockOracle({ price, conf }).accountsPartial({
      mockOracle: this.mockOraclePda(marketIndex),
      authority,
    });
  }
}
