//! `update_funding_rate` — keeper crank. Refreshes the mark/oracle TWAPs and accrues the
//! market's cumulative funding for the elapsed time. Longs pay shorts when the perp trades
//! above the index (positive rate); shorts pay longs when below.

use crate::constants::*;
use crate::errors::ErrorCode;
use crate::events::FundingRecord;
use crate::math::amm::mark_price;
use crate::math::funding::{calculate_funding_rate, funding_delta_per_base, update_twap};
use crate::math::safe::SafeMath;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateFundingRate<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

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

pub fn update_funding_rate(ctx: Context<UpdateFundingRate>) -> Result<()> {
    let state = &ctx.accounts.state;
    let market = &mut ctx.accounts.market;
    let now = Clock::get()?.unix_timestamp;

    let oracle = load_oracle_price(
        market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &market.feed_id,
        state.max_oracle_staleness_seconds,
        state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;
    let mark = mark_price(&market.amm)?;
    let window = market.funding_period.max(1);

    // Refresh TWAPs (time-weighted toward current over the funding window).
    let elapsed_twap = now.safe_sub(market.amm.last_twap_ts)?;
    market.amm.last_mark_price_twap =
        update_twap(market.amm.last_mark_price_twap, mark, elapsed_twap, window)?;
    market.amm.last_oracle_price_twap = update_twap(
        market.amm.last_oracle_price_twap,
        oracle.price,
        elapsed_twap,
        window,
    )?;
    market.amm.last_twap_ts = now;

    // Accrue funding for the elapsed time (capped at one period to bound a single jump).
    let elapsed_funding = now.safe_sub(market.amm.last_funding_ts)?;
    if elapsed_funding > 0 {
        let period = elapsed_funding.min(market.funding_period);
        let rate = calculate_funding_rate(
            market.amm.last_mark_price_twap,
            market.amm.last_oracle_price_twap,
            period,
            MAX_FUNDING_RATE,
        )?;
        let delta = funding_delta_per_base(rate, market.amm.last_oracle_price_twap)?;
        // v1: symmetric funding — one cumulative figure applies to longs and shorts.
        market.amm.cumulative_funding_rate_long =
            market.amm.cumulative_funding_rate_long.safe_add(delta)?;
        market.amm.cumulative_funding_rate_short = market.amm.cumulative_funding_rate_long;
        market.amm.last_funding_rate = rate;
        market.amm.last_funding_ts = now;
        market.next_funding_ts = now.safe_add(market.funding_period)?;

        msg!(
            "funding mkt={} rate={} cum={}",
            market.market_index,
            rate,
            market.amm.cumulative_funding_rate_long
        );

        emit!(FundingRecord {
            market_index: market.market_index,
            rate,
            cumulative: market.amm.cumulative_funding_rate_long,
            mark_twap: market.amm.last_mark_price_twap,
            oracle_twap: market.amm.last_oracle_price_twap,
            ts: now,
        });
    }
    Ok(())
}
