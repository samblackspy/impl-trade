//! `open_position` — market order against the vAMM. Thin wrapper over
//! `controller::execute_amm_open`, which is shared with keeper-filled limit orders so both
//! paths price and book-keep identically.

use crate::controller::execute_amm_open;
use crate::errors::ErrorCode;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OpenPositionParams {
    pub direction: PositionDirection,
    /// Order size, magnitude in BASE_PRECISION.
    pub base_amount: u64,
    /// Slippage guard (PRICE_PRECISION): max avg price for a long, min for a short. 0 = none.
    pub price_limit: u64,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Account<'info, State>,

    #[account(
        mut,
        seeds = [User::SEED, authority.key().as_ref()],
        bump = user.bump,
        has_one = authority
    )]
    pub user: Box<Account<'info, User>>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Market::SEED, market.market_index.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,

    /// CHECK: key constrained to `market.oracle`; deserialized + owner-checked by
    /// `load_oracle_price` according to `market.oracle_source`.
    #[account(address = market.oracle @ ErrorCode::InvalidOracleFeed)]
    pub price_update: UncheckedAccount<'info>,
}

pub fn open_position(ctx: Context<OpenPosition>, params: OpenPositionParams) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProtocolPaused);
    ctx.accounts.market.require_can_open()?;
    require!(
        params.base_amount >= ctx.accounts.market.min_order_base && params.base_amount > 0,
        ErrorCode::OrderTooSmall
    );
    require!(
        !ctx.accounts.user.being_liquidated,
        ErrorCode::BeingLiquidated
    );

    let oracle = load_oracle_price(
        ctx.accounts.market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &ctx.accounts.market.feed_id,
        ctx.accounts.state.max_oracle_staleness_seconds,
        ctx.accounts.state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;
    let taker_fee_bps = ctx.accounts.state.taker_fee_bps;

    let quote = execute_amm_open(
        &mut ctx.accounts.user,
        &mut ctx.accounts.market,
        taker_fee_bps,
        params.direction,
        params.base_amount,
        params.price_limit,
        oracle.price,
    )?;

    msg!(
        "open dir={:?} base={} quote={}",
        params.direction,
        params.base_amount,
        quote
    );
    Ok(())
}
