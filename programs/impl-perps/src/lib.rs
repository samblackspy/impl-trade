//! impl.trade perpetual futures DEX program.
//!
//! Hybrid perps engine: a virtual AMM for price discovery + on-chain settlement of an
//! off-chain limit orderbook (Phase 3). This crate is the on-chain core: state, math,
//! oracle, and instructions.

use anchor_lang::prelude::*;

pub mod constants;
pub mod controller;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;

use instructions::*;

declare_id!("BCA9Q2N8HXW48KB5hh9QFH4LT4gzyiCf4Qkx5ZwDcM5d");

#[program]
pub mod impl_perps {
    use super::*;

    /// One-time global setup (admin).
    pub fn initialize_state(
        ctx: Context<InitializeState>,
        params: InitializeStateParams,
    ) -> Result<()> {
        instructions::initialize_state::initialize_state(ctx, params)
    }

    /// Create a perp market with a balanced vAMM (admin).
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        params: InitializeMarketParams,
    ) -> Result<()> {
        instructions::initialize_market::initialize_market(ctx, params)
    }

    /// Retune a market's risk params + status (admin). Status flips Active / ReduceOnly /
    /// Paused — a per-market circuit breaker.
    pub fn update_market_params(
        ctx: Context<UpdateMarket>,
        params: UpdateMarketArgs,
    ) -> Result<()> {
        instructions::update_market_params::update_market_params(ctx, params)
    }

    /// Global circuit breaker: pause/unpause all user-facing position changes (admin).
    pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
        instructions::set_protocol_paused::set_protocol_paused(ctx, paused)
    }

    /// Create a program-owned mock price account (admin; local/dev only).
    pub fn initialize_mock_oracle(
        ctx: Context<InitializeMockOracle>,
        params: InitializeMockOracleParams,
    ) -> Result<()> {
        instructions::initialize_mock_oracle::initialize_mock_oracle(ctx, params)
    }

    /// Push a fresh price into a mock oracle (authority; local/dev only).
    pub fn update_mock_oracle(
        ctx: Context<UpdateMockOracle>,
        params: UpdateMockOracleParams,
    ) -> Result<()> {
        instructions::update_mock_oracle::update_mock_oracle(ctx, params)
    }

    /// Create the caller's user account.
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        instructions::initialize_user::initialize_user(ctx)
    }

    /// Deposit USDC collateral.
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::deposit_collateral::deposit_collateral(ctx, amount)
    }

    /// Withdraw USDC collateral (subject to initial-margin solvency).
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        instructions::withdraw_collateral::withdraw_collateral(ctx, amount)
    }

    /// Open/increase a position via the vAMM (market order).
    pub fn open_position(ctx: Context<OpenPosition>, params: OpenPositionParams) -> Result<()> {
        instructions::open_position::open_position(ctx, params)
    }

    /// Rest a limit order.
    pub fn place_perp_order(
        ctx: Context<PlacePerpOrder>,
        params: PlacePerpOrderParams,
    ) -> Result<()> {
        instructions::place_perp_order::place_perp_order(ctx, params)
    }

    /// Cancel a resting order by id.
    pub fn cancel_order(ctx: Context<CancelOrder>, order_id: u32) -> Result<()> {
        instructions::cancel_order::cancel_order(ctx, order_id)
    }

    /// Keeper: fill a resting limit order against the AMM (opening or reduce-only).
    pub fn fill_perp_order(ctx: Context<FillPerpOrder>, order_id: u32) -> Result<()> {
        instructions::fill_perp_order::fill_perp_order(ctx, order_id)
    }

    /// Keeper: cross two resting limit orders against each other (maker-vs-maker).
    pub fn fill_perp_match(
        ctx: Context<FillPerpMatch>,
        taker_order_id: u32,
        maker_order_id: u32,
    ) -> Result<()> {
        instructions::fill_perp_match::fill_perp_match(ctx, taker_order_id, maker_order_id)
    }

    /// Keeper: execute a stop-loss / take-profit when the oracle crosses its trigger.
    pub fn trigger_order(ctx: Context<TriggerOrder>, order_id: u32) -> Result<()> {
        instructions::trigger_order::trigger_order(ctx, order_id)
    }

    /// Reduce/close a position via the vAMM.
    pub fn close_position(ctx: Context<ClosePosition>, params: ClosePositionParams) -> Result<()> {
        instructions::close_position::close_position(ctx, params)
    }

    /// Permissionless liquidation of an under-maintenance account (keeper).
    pub fn liquidate_perp(ctx: Context<LiquidatePerp>, max_base_amount: u64) -> Result<()> {
        instructions::liquidate_perp::liquidate_perp(ctx, max_base_amount)
    }

    /// Keeper crank: refresh TWAPs + accrue funding for a market.
    pub fn update_funding_rate(ctx: Context<UpdateFundingRate>) -> Result<()> {
        instructions::update_funding_rate::update_funding_rate(ctx)
    }

    /// Apply a position's accrued funding to its collateral (permissionless crank).
    pub fn settle_funding(ctx: Context<SettleFunding>) -> Result<()> {
        instructions::settle_funding::settle_funding(ctx)
    }

    /// Cover a bankrupt account's bad debt from the insurance fund (keeper).
    pub fn resolve_perp_bankruptcy(ctx: Context<ResolvePerpBankruptcy>) -> Result<()> {
        instructions::resolve_perp_bankruptcy::resolve_perp_bankruptcy(ctx)
    }
}
