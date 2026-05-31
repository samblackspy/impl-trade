//! `settle_funding` — apply a position's accrued funding to its collateral. Permissionless
//! crank: the math is deterministic from on-chain state, so a keeper (or anyone) can call
//! it. Positive payment = the user pays (longs when funding is positive); negative = the
//! user receives.

use crate::errors::ErrorCode;
use crate::math::funding::funding_payment;
use crate::math::safe::{cast_i64, cast_u64, SafeMath};
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SettleFunding<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    #[account(mut)]
    pub user: Box<Account<'info, User>>,

    #[account(
        seeds = [Market::SEED, market.market_index.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,
}

pub fn settle_funding(ctx: Context<SettleFunding>) -> Result<()> {
    let market = &ctx.accounts.market;
    let user = &mut ctx.accounts.user;

    let pos_idx = user
        .find_position(market.market_index)
        .ok_or(ErrorCode::PositionNotFound)?;

    let cum_now = market.amm.cumulative_funding_rate_long;
    let payment = funding_payment(
        user.positions[pos_idx].base_asset_amount,
        cum_now,
        user.positions[pos_idx].last_cumulative_funding_rate,
    )?; // positive => user pays

    let new_collateral = (user.collateral as i128).safe_sub(payment)?;
    user.collateral = if new_collateral < 0 {
        // Shortfall is recorded as bad debt (resolved from the insurance fund); the
        // position is now under water and the keeper will liquidate it.
        user.bad_debt = user
            .bad_debt
            .safe_add(cast_u64((-new_collateral) as u128)?)?;
        0
    } else {
        cast_u64(new_collateral as u128)?
    };
    user.positions[pos_idx].last_cumulative_funding_rate = cum_now;
    user.settled_pnl = user.settled_pnl.safe_sub(cast_i64(payment)?)?;
    Ok(())
}
