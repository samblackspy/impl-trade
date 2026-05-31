//! `update_market_params` — admin risk-parameter tuning + per-market circuit breaker. Lets
//! the admin retune margin/fees/caps and flip a market between `Active`, `ReduceOnly`
//! (only position-reducing actions) and `Paused` (all trading halted) after creation.

use crate::errors::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateMarketArgs {
    pub status: MarketStatus,
    pub margin_ratio_initial: u32,
    pub margin_ratio_maintenance: u32,
    pub max_leverage: u32,
    pub min_order_base: u64,
    pub max_open_interest: u128,
    pub liquidation_fee_bps: u16,
    pub funding_period: i64,
}

#[derive(Accounts)]
pub struct UpdateMarket<'info> {
    #[account(seeds = [State::SEED], bump = state.bump, has_one = admin)]
    pub state: Box<Account<'info, State>>,

    #[account(
        mut,
        seeds = [Market::SEED, market.market_index.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,

    pub admin: Signer<'info>,
}

pub fn update_market_params(ctx: Context<UpdateMarket>, params: UpdateMarketArgs) -> Result<()> {
    require!(
        params.margin_ratio_initial > params.margin_ratio_maintenance
            && params.margin_ratio_maintenance > 0,
        ErrorCode::InvalidAmount
    );
    require!(params.funding_period > 0, ErrorCode::InvalidAmount);

    let market = &mut ctx.accounts.market;
    market.status = params.status;
    market.margin_ratio_initial = params.margin_ratio_initial;
    market.margin_ratio_maintenance = params.margin_ratio_maintenance;
    market.max_leverage = params.max_leverage;
    market.min_order_base = params.min_order_base;
    market.max_open_interest = params.max_open_interest;
    market.liquidation_fee_bps = params.liquidation_fee_bps;
    market.funding_period = params.funding_period;

    msg!(
        "market {} params updated; status={:?}",
        market.market_index,
        market.status
    );
    Ok(())
}
