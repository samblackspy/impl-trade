//! `trigger_order` — keeper crank for stop-loss / take-profit. When the oracle crosses a
//! resting trigger order's `trigger_price` (in the configured direction), the position is
//! reduced/closed against the AMM. Trigger orders are **reduce-only** in v1 (the SL/TP use
//! case): `TriggerMarket` closes at market, `TriggerLimit` closes subject to its limit price.
//!
//! Permissionless: the trigger condition + the AMM slippage guard are re-checked on-chain, so
//! a mistimed crank simply reverts.

use crate::controller::execute_amm_close;
use crate::errors::ErrorCode;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct TriggerOrder<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    /// Permissionless cranker (keeper).
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

pub fn trigger_order(ctx: Context<TriggerOrder>, order_id: u32) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProtocolPaused);
    let taker_fee_bps = ctx.accounts.state.taker_fee_bps;
    let market = &mut ctx.accounts.market;
    market.require_can_reduce()?;

    let slot = ctx
        .accounts
        .user
        .orders
        .iter()
        .position(|o| o.is_open() && o.order_id == order_id)
        .ok_or(ErrorCode::OrderNotFound)?;
    let order = ctx.accounts.user.orders[slot];
    require!(
        matches!(
            order.order_type,
            OrderType::TriggerMarket | OrderType::TriggerLimit
        ),
        ErrorCode::UnsupportedOrderType
    );
    // v1: trigger orders close an existing position (stop-loss / take-profit).
    require!(order.reduce_only, ErrorCode::UnsupportedOrderType);
    require!(
        order.market_index == market.market_index,
        ErrorCode::InvalidMarketIndex
    );

    // Has the index crossed the trigger?
    let oracle = load_oracle_price(
        market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &market.feed_id,
        ctx.accounts.state.max_oracle_staleness_seconds,
        ctx.accounts.state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;
    let fired = match order.trigger_condition {
        OrderTriggerCondition::Above => oracle.price >= order.trigger_price,
        OrderTriggerCondition::Below => oracle.price <= order.trigger_price,
    };
    require!(fired, ErrorCode::TriggerConditionNotMet);

    let user = &mut ctx.accounts.user;
    let pos_idx = user
        .find_position(market.market_index)
        .ok_or(ErrorCode::PositionNotFound)?;
    let abs_base = user.positions[pos_idx].base_asset_amount.unsigned_abs();
    let close_base = order.remaining_base().min(abs_base);
    require!(close_base > 0, ErrorCode::InvalidAmount);

    // TriggerMarket closes at market (no price cap); TriggerLimit respects its limit price.
    let price_limit = if order.order_type == OrderType::TriggerLimit {
        order.price
    } else {
        0
    };

    let realized = execute_amm_close(
        user,
        market,
        taker_fee_bps,
        pos_idx,
        close_base,
        price_limit,
    )?;

    // A stop-loss / take-profit fires once; consume the order.
    user.orders[slot].base_asset_amount_filled =
        order.base_asset_amount_filled.saturating_add(close_base);
    user.orders[slot].status = OrderStatus::Init;

    msg!(
        "trigger order={} closed={} realized={} oracle={}",
        order_id,
        close_base,
        realized,
        oracle.price
    );
    Ok(())
}
