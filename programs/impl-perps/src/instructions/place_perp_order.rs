//! `place_perp_order` — rest a limit order in the user's order array. It executes later
//! when a keeper crosses it via `fill_perp_order` (against the AMM in v1). No margin is
//! reserved at placement; initial margin is enforced at fill time.

use crate::errors::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PlacePerpOrderParams {
    /// `Limit` (resting maker), `TriggerMarket` / `TriggerLimit` (stop-loss / take-profit).
    /// `Market` is rejected here — market orders execute immediately via `open_position`.
    pub order_type: OrderType,
    pub direction: PositionDirection,
    pub base_amount: u64,
    /// Limit price, PRICE_PRECISION (required for `Limit`/`TriggerLimit`; 0 for `TriggerMarket`).
    pub price: u64,
    /// Trigger price, PRICE_PRECISION (required for the trigger types; 0 otherwise).
    pub trigger_price: u64,
    /// Fire when the oracle is `Above` / `Below` `trigger_price`.
    pub trigger_condition: OrderTriggerCondition,
    pub reduce_only: bool,
    pub post_only: bool,
}

#[derive(Accounts)]
pub struct PlacePerpOrder<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    #[account(
        mut,
        seeds = [User::SEED, authority.key().as_ref()],
        bump = user.bump,
        has_one = authority
    )]
    pub user: Box<Account<'info, User>>,

    pub authority: Signer<'info>,

    #[account(
        seeds = [Market::SEED, market.market_index.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,
}

pub fn place_perp_order(ctx: Context<PlacePerpOrder>, params: PlacePerpOrderParams) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProtocolPaused);
    ctx.accounts
        .market
        .require_can_place_order(params.reduce_only)?;
    require!(
        params.base_amount >= ctx.accounts.market.min_order_base && params.base_amount > 0,
        ErrorCode::OrderTooSmall
    );
    // Per-type price requirements. Market orders don't rest.
    match params.order_type {
        OrderType::Market => return Err(ErrorCode::UnsupportedOrderType.into()),
        OrderType::Limit => require!(params.price > 0, ErrorCode::InvalidAmount),
        OrderType::TriggerMarket => {
            require!(params.trigger_price > 0, ErrorCode::InvalidAmount)
        }
        OrderType::TriggerLimit => require!(
            params.price > 0 && params.trigger_price > 0,
            ErrorCode::InvalidAmount
        ),
    }

    let market_index = ctx.accounts.market.market_index;
    let now = Clock::get()?.unix_timestamp;
    let user = &mut ctx.accounts.user;

    let slot = user
        .orders
        .iter()
        .position(|o| !o.is_open())
        .ok_or(ErrorCode::OrdersFull)?;
    let order_id = user.next_order_id();
    user.orders[slot] = Order {
        order_id,
        market_index,
        order_type: params.order_type,
        status: OrderStatus::Open,
        direction: params.direction,
        base_asset_amount: params.base_amount,
        base_asset_amount_filled: 0,
        price: params.price,
        trigger_price: params.trigger_price,
        trigger_condition: params.trigger_condition,
        reduce_only: params.reduce_only,
        post_only: params.post_only,
        ts: now,
    };

    msg!(
        "place order id={} type={:?} dir={:?} base={} px={} trig={}",
        order_id,
        params.order_type,
        params.direction,
        params.base_amount,
        params.price,
        params.trigger_price
    );
    Ok(())
}
