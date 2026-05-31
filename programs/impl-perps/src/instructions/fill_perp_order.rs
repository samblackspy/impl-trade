//! `fill_perp_order` — keeper fills a resting limit order against the vAMM. Permissionless:
//! the `execute_amm_*` slippage guards reject any fill worse than the order's limit, so a
//! mistimed crank simply reverts. An opening order increases the position; a **reduce-only**
//! order closes it (respecting the limit price). Maker-vs-maker matching is `fill_perp_match`.

use crate::controller::{execute_amm_close, execute_amm_open};
use crate::errors::ErrorCode;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct FillPerpOrder<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    /// Permissionless filler (keeper).
    pub filler: Signer<'info>,

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
}

pub fn fill_perp_order(ctx: Context<FillPerpOrder>, order_id: u32) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProtocolPaused);
    let taker_fee_bps = ctx.accounts.state.taker_fee_bps;
    let market_index = ctx.accounts.market.market_index;

    let slot = ctx
        .accounts
        .user
        .orders
        .iter()
        .position(|o| o.is_open() && o.order_id == order_id)
        .ok_or(ErrorCode::OrderNotFound)?;
    let order = ctx.accounts.user.orders[slot];
    require!(
        order.order_type == OrderType::Limit,
        ErrorCode::UnsupportedOrderType
    );
    require!(
        order.market_index == market_index,
        ErrorCode::InvalidMarketIndex
    );
    let remaining = order.remaining_base();
    require!(remaining > 0, ErrorCode::InvalidAmount);
    if order.reduce_only {
        ctx.accounts.market.require_can_reduce()?;
    } else {
        ctx.accounts.market.require_can_open()?;
    }

    // Freshness gate (the fill itself prices off the AMM, bounded by the order's limit).
    let oracle = load_oracle_price(
        ctx.accounts.market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &ctx.accounts.market.feed_id,
        ctx.accounts.state.max_oracle_staleness_seconds,
        ctx.accounts.state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;

    if order.reduce_only {
        // Close the existing position (the order must oppose it; it cannot flip the side).
        let pos_idx = ctx
            .accounts
            .user
            .find_position(market_index)
            .ok_or(ErrorCode::PositionNotFound)?;
        let pos_base = ctx.accounts.user.positions[pos_idx].base_asset_amount;
        let pos_is_long = pos_base > 0;
        require!(
            (order.direction == PositionDirection::Long) != pos_is_long,
            ErrorCode::ReduceOnlyViolation
        );
        let abs_base = pos_base.unsigned_abs();
        let close_base = remaining.min(abs_base);
        require!(close_base > 0, ErrorCode::InvalidAmount);

        let realized = execute_amm_close(
            &mut ctx.accounts.user,
            &mut ctx.accounts.market,
            taker_fee_bps,
            pos_idx,
            close_base,
            order.price, // limit price: min when closing a long, max when closing a short
        )?;

        let o = &mut ctx.accounts.user.orders[slot];
        o.base_asset_amount_filled = o.base_asset_amount_filled.saturating_add(close_base);
        if o.remaining_base() == 0 || close_base == abs_base {
            *o = Order::default(); // fully filled (or position closed) — free the slot
        }
        msg!(
            "fill (reduce) order id={} base={} realized={}",
            order_id,
            close_base,
            realized
        );
    } else {
        let quote = execute_amm_open(
            &mut ctx.accounts.user,
            &mut ctx.accounts.market,
            taker_fee_bps,
            order.direction,
            remaining,
            order.price,
            oracle.price,
        )?;
        ctx.accounts.user.orders[slot] = Order::default();
        msg!(
            "fill order id={} base={} quote={}",
            order_id,
            remaining,
            quote
        );
    }
    Ok(())
}
