//! `liquidate_perp` — permissionless (keeper) liquidation of an account below maintenance
//! margin. Settles funding first, then closes up to `max_base_amount` of the position
//! against the vAMM (partial liquidation; `0` = close the whole position), charges a
//! liquidation fee to the insurance fund, and records any residual bad debt for
//! `resolve_perp_bankruptcy`.

use crate::errors::ErrorCode;
use crate::events::LiquidationRecord;
use crate::math::amm::{calculate_swap, SwapDirection};
use crate::math::funding::funding_payment;
use crate::math::liquidation::{is_liquidatable, liquidation_fee};
use crate::math::margin::{position_notional, MarginCalculation};
use crate::math::safe::{cast_i64, cast_u64, SafeMath};
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct LiquidatePerp<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    /// Whoever cranks the liquidation (typically a keeper). Permissionless by design.
    pub liquidator: Signer<'info>,

    /// The account being liquidated. `Account<User>` guarantees a real program-owned user.
    #[account(mut)]
    pub user: Box<Account<'info, User>>,

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

    #[account(mut, seeds = [InsuranceFund::SEED], bump = insurance_fund.bump)]
    pub insurance_fund: Box<Account<'info, InsuranceFund>>,
}

pub fn liquidate_perp(ctx: Context<LiquidatePerp>, max_base_amount: u64) -> Result<()> {
    let state = &ctx.accounts.state;
    let market = &mut ctx.accounts.market;

    let oracle = load_oracle_price(
        market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &market.feed_id,
        state.max_oracle_staleness_seconds,
        state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;

    let user = &mut ctx.accounts.user;
    let pos_idx = user
        .find_position(market.market_index)
        .ok_or(ErrorCode::PositionNotFound)?;

    // 1) Settle funding first so the health check reflects what the user owes/receives.
    {
        let cum_now = market.amm.cumulative_funding_rate_long;
        let payment = funding_payment(
            user.positions[pos_idx].base_asset_amount,
            cum_now,
            user.positions[pos_idx].last_cumulative_funding_rate,
        )?;
        let after = (user.collateral as i128).safe_sub(payment)?;
        if after < 0 {
            user.bad_debt = user.bad_debt.safe_add(cast_u64((-after) as u128)?)?;
            user.collateral = 0;
        } else {
            user.collateral = cast_u64(after as u128)?;
        }
        user.positions[pos_idx].last_cumulative_funding_rate = cum_now;
    }

    // 2) Health check — must be below maintenance margin.
    let base_before = user.positions[pos_idx].base_asset_amount;
    require!(base_before != 0, ErrorCode::PositionNotFound);
    let mut margin = MarginCalculation::new(user.collateral);
    margin.add_position(
        &user.positions[pos_idx],
        oracle.price,
        market.margin_ratio_initial,
        market.margin_ratio_maintenance,
    )?;
    require!(
        is_liquidatable(
            margin.total_collateral,
            margin.maintenance_margin_requirement
        ),
        ErrorCode::NotLiquidatable
    );

    // 3) Close up to `max_base_amount` (0 = full) against the AMM.
    let pos_is_long = base_before > 0;
    let abs_base = base_before.unsigned_abs();
    let close_base = if max_base_amount == 0 || max_base_amount > abs_base {
        abs_base
    } else {
        max_base_amount
    };
    let quote_entry_before = user.positions[pos_idx].quote_entry_amount;
    let notional_closed = position_notional(close_base as i64, oracle.price)?;

    let swap_dir = if pos_is_long {
        SwapDirection::Add
    } else {
        SwapDirection::Remove
    };
    let swap = calculate_swap(
        market.amm.base_asset_reserve,
        market.amm.quote_asset_reserve,
        market.amm.peg_multiplier,
        close_base as u128,
        swap_dir,
    )?;

    let q_closed = (quote_entry_before as i128)
        .safe_mul(close_base as i128)?
        .safe_div(abs_base as i128)?;
    let quote_flow = if pos_is_long {
        swap.quote_amount as i128
    } else {
        -(swap.quote_amount as i128)
    };
    let realized = quote_flow.safe_add(q_closed)?;

    // --- EFFECTS ---
    market.amm.base_asset_reserve = swap.new_base_reserve;
    market.amm.quote_asset_reserve = swap.new_quote_reserve;
    {
        let pos = &mut user.positions[pos_idx];
        pos.base_asset_amount = if pos_is_long {
            pos.base_asset_amount.safe_sub(close_base as i64)?
        } else {
            pos.base_asset_amount.safe_add(close_base as i64)?
        };
        pos.quote_entry_amount = pos.quote_entry_amount.safe_sub(cast_i64(q_closed)?)?;
        if pos.base_asset_amount == 0 {
            pos.quote_entry_amount = 0;
        }
    }

    let collateral_after_pnl = (user.collateral as i128).safe_add(realized)?;
    let fee_target = liquidation_fee(notional_closed, market.liquidation_fee_bps)? as i128;
    let liq_fee = fee_target.min(collateral_after_pnl.max(0));
    let final_collateral = collateral_after_pnl.safe_sub(liq_fee)?;

    if liq_fee > 0 {
        ctx.accounts.insurance_fund.total_deposits = ctx
            .accounts
            .insurance_fund
            .total_deposits
            .safe_add(cast_u64(liq_fee as u128)?)?;
    }

    if final_collateral < 0 {
        user.bad_debt = user
            .bad_debt
            .safe_add(cast_u64((-final_collateral) as u128)?)?;
        user.collateral = 0;
        user.bankrupt = true;
    } else {
        user.collateral = cast_u64(final_collateral as u128)?;
    }
    user.settled_pnl = user.settled_pnl.safe_add(cast_i64(realized)?)?;
    user.being_liquidated = false;

    if pos_is_long {
        market.open_interest_long = market.open_interest_long.saturating_sub(close_base as u128);
        market.amm.base_asset_amount_long = market
            .amm
            .base_asset_amount_long
            .safe_sub(close_base as i128)?;
    } else {
        market.open_interest_short = market
            .open_interest_short
            .saturating_sub(close_base as u128);
        market.amm.base_asset_amount_short = market
            .amm
            .base_asset_amount_short
            .safe_add(close_base as i128)?;
    }

    msg!(
        "liquidate user={} closed={} realized={} liqFee={} badDebt={}",
        user.authority,
        close_base,
        realized,
        liq_fee,
        user.bad_debt
    );

    emit!(LiquidationRecord {
        user: user.authority,
        market_index: market.market_index,
        liquidator: ctx.accounts.liquidator.key(),
        base_closed: close_base,
        liq_fee: cast_u64(liq_fee.max(0) as u128)?,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
