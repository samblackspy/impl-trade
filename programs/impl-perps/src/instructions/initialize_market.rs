//! `initialize_market` — admin creates a perp market with a balanced vAMM. Markets must
//! be created with sequential indices (0, 1, 2, ...).

use crate::errors::ErrorCode;
use crate::math::amm::initial_reserves;
use crate::math::safe::{cast_u64, SafeMath};
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeMarketParams {
    pub market_index: u16,
    pub oracle: Pubkey,
    pub oracle_source: OracleSource,
    pub feed_id: [u8; 32],
    pub name: [u8; 16],
    /// Initial price in PEG_PRECISION (mark price at creation).
    pub peg_multiplier: u128,
    /// Per-side virtual reserve depth (also sqrt_k): larger => less slippage.
    pub amm_reserve: u128,
    pub margin_ratio_initial: u32,
    pub margin_ratio_maintenance: u32,
    pub max_leverage: u32,
    pub min_order_base: u64,
    pub max_open_interest: u128,
    pub liquidation_fee_bps: u16,
    pub funding_period: i64,
}

#[derive(Accounts)]
#[instruction(params: InitializeMarketParams)]
pub struct InitializeMarket<'info> {
    #[account(mut, seeds = [State::SEED], bump = state.bump, has_one = admin)]
    pub state: Account<'info, State>,

    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED, params.market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_market(
    ctx: Context<InitializeMarket>,
    params: InitializeMarketParams,
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    require!(
        params.market_index == state.num_markets,
        ErrorCode::InvalidMarketIndex
    );
    require!(
        params.margin_ratio_initial > params.margin_ratio_maintenance
            && params.margin_ratio_maintenance > 0,
        ErrorCode::InvalidAmount
    );

    let market = &mut ctx.accounts.market;
    market.market_index = params.market_index;
    market.status = MarketStatus::Active;
    market.oracle = params.oracle;
    market.oracle_source = params.oracle_source;
    market.feed_id = params.feed_id;
    market.name = params.name;
    let now = Clock::get()?.unix_timestamp;
    market.amm = initial_reserves(params.amm_reserve, params.peg_multiplier)?;
    // Seed TWAPs to the initial mark (= peg) so the first funding crank measures from here.
    let init_price = cast_u64(params.peg_multiplier)?;
    market.amm.last_mark_price_twap = init_price;
    market.amm.last_oracle_price_twap = init_price;
    market.amm.last_twap_ts = now;
    market.amm.last_funding_ts = now;
    market.margin_ratio_initial = params.margin_ratio_initial;
    market.margin_ratio_maintenance = params.margin_ratio_maintenance;
    market.max_leverage = params.max_leverage;
    market.min_order_base = params.min_order_base;
    market.max_open_interest = params.max_open_interest;
    market.liquidation_fee_bps = params.liquidation_fee_bps;
    market.funding_period = params.funding_period;
    market.next_funding_ts = now.safe_add(params.funding_period)?;
    market.bump = ctx.bumps.market;

    state.num_markets = state
        .num_markets
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!(
        "market {} initialized: {}",
        market.market_index,
        market.name_str()
    );
    Ok(())
}
