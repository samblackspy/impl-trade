//! `close_position` — reduce or fully close a position against the vAMM, realizing PnL into
//! collateral. Allowed even when the protocol is paused (risk-reducing). The close math is
//! shared with `trigger_order` (stop-loss / take-profit) via `controller::execute_amm_close`.

use crate::controller::execute_amm_close;
use crate::errors::ErrorCode;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ClosePositionParams {
    /// Base magnitude to close (BASE_PRECISION). 0 = full close.
    pub base_amount: u64,
    /// Slippage guard (PRICE_PRECISION): min avg price when closing a long (selling),
    /// max avg price when closing a short (buying). 0 = none.
    pub price_limit: u64,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
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

pub fn close_position(ctx: Context<ClosePosition>, params: ClosePositionParams) -> Result<()> {
    let state = &ctx.accounts.state;
    let market = &mut ctx.accounts.market;

    // Freshness guard only (defense-in-depth): a close prices off the AMM, so the validated
    // oracle value itself is intentionally unused here.
    let _oracle = load_oracle_price(
        market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &market.feed_id,
        state.max_oracle_staleness_seconds,
        state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;
    let taker_fee_bps = state.taker_fee_bps;

    let user = &mut ctx.accounts.user;
    let pos_idx = user
        .find_position(market.market_index)
        .ok_or(ErrorCode::PositionNotFound)?;
    let abs_base = user.positions[pos_idx].base_asset_amount.unsigned_abs();
    require!(abs_base != 0, ErrorCode::PositionNotFound);
    let close_base = if params.base_amount == 0 || params.base_amount > abs_base {
        abs_base
    } else {
        params.base_amount
    };

    let realized = execute_amm_close(
        user,
        market,
        taker_fee_bps,
        pos_idx,
        close_base,
        params.price_limit,
    )?;
    msg!("close base={} realized={}", close_base, realized);
    Ok(())
}
