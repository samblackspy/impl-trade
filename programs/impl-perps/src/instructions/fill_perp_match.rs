//! `fill_perp_match` — keeper crosses two resting limit orders against each other
//! (maker-vs-maker), settling peer-to-peer at the **maker's** price rather than against the
//! AMM. The two orders must be opposite sides whose prices overlap; the fill is the smaller
//! remaining size. Permissionless: all checks are re-validated on-chain, so a stale crank
//! just reverts. v1 matches opening orders (reduce-only fills go through `fill_perp_order`).

use crate::controller::execute_maker_match;
use crate::errors::ErrorCode;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct FillPerpMatch<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    /// Permissionless cranker (keeper).
    pub filler: Signer<'info>,

    /// The aggressing order's owner. Crosses at the maker's price.
    #[account(mut)]
    pub taker: Box<Account<'info, User>>,

    /// The resting order's owner (gets price priority + the maker rebate).
    #[account(mut)]
    pub maker: Box<Account<'info, User>>,

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

pub fn fill_perp_match(
    ctx: Context<FillPerpMatch>,
    taker_order_id: u32,
    maker_order_id: u32,
) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProtocolPaused);
    require!(
        ctx.accounts.taker.key() != ctx.accounts.maker.key(),
        ErrorCode::SelfMatch
    );
    let taker_fee_bps = ctx.accounts.state.taker_fee_bps;
    let maker_rebate_bps = ctx.accounts.state.maker_rebate_bps;
    let market_index = ctx.accounts.market.market_index;
    ctx.accounts.market.require_can_open()?;

    let t_slot = find_open_limit(&ctx.accounts.taker, taker_order_id, market_index)?;
    let m_slot = find_open_limit(&ctx.accounts.maker, maker_order_id, market_index)?;
    let t_order = ctx.accounts.taker.orders[t_slot];
    let m_order = ctx.accounts.maker.orders[m_slot];

    // Opposite sides whose prices overlap, filled at the maker's resting price.
    require!(
        t_order.direction != m_order.direction,
        ErrorCode::OrdersDoNotCross
    );
    let crosses = if t_order.direction == PositionDirection::Long {
        t_order.price >= m_order.price // taker buys at/above the maker's ask
    } else {
        t_order.price <= m_order.price // taker sells at/below the maker's bid
    };
    require!(crosses, ErrorCode::OrdersDoNotCross);

    let base = t_order.remaining_base().min(m_order.remaining_base());
    require!(base > 0, ErrorCode::InvalidAmount);
    let fill_price = m_order.price;

    let oracle = load_oracle_price(
        ctx.accounts.market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &ctx.accounts.market.feed_id,
        ctx.accounts.state.max_oracle_staleness_seconds,
        ctx.accounts.state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;

    execute_maker_match(
        &mut ctx.accounts.taker,
        &mut ctx.accounts.maker,
        &mut ctx.accounts.market,
        taker_fee_bps,
        maker_rebate_bps,
        t_order.direction,
        base,
        fill_price,
        oracle.price,
    )?;

    fill_and_maybe_clear(&mut ctx.accounts.taker.orders[t_slot], base);
    fill_and_maybe_clear(&mut ctx.accounts.maker.orders[m_slot], base);

    msg!(
        "match taker={} maker={} base={} price={}",
        ctx.accounts.taker.authority,
        ctx.accounts.maker.authority,
        base,
        fill_price
    );
    Ok(())
}

/// Find an open `Limit`, non-reduce-only order by id in `user`'s array (v1 matches openers).
fn find_open_limit(user: &User, order_id: u32, market_index: u16) -> Result<usize> {
    let slot = user
        .orders
        .iter()
        .position(|o| o.is_open() && o.order_id == order_id)
        .ok_or(ErrorCode::OrderNotFound)?;
    let o = &user.orders[slot];
    require!(
        o.order_type == OrderType::Limit,
        ErrorCode::UnsupportedOrderType
    );
    require!(!o.reduce_only, ErrorCode::UnsupportedOrderType);
    require!(
        o.market_index == market_index,
        ErrorCode::InvalidMarketIndex
    );
    Ok(slot)
}

fn fill_and_maybe_clear(order: &mut Order, base: u64) {
    order.base_asset_amount_filled = order.base_asset_amount_filled.saturating_add(base);
    if order.remaining_base() == 0 {
        *order = Order::default();
    }
}
