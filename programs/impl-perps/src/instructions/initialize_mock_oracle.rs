//! `initialize_mock_oracle` — admin creates a program-owned price account for **local/dev**.
//!
//! Pair with a market created using `OracleSource::Mock` whose `oracle` is this PDA. The
//! admin becomes the price-push authority (see `update_mock_oracle`). Not for mainnet.

use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeMockOracleParams {
    pub market_index: u16,
    /// Initial price in PRICE_PRECISION (1e6).
    pub price: u64,
    /// Initial confidence in PRICE_PRECISION (1e6).
    pub conf: u64,
}

#[derive(Accounts)]
#[instruction(params: InitializeMockOracleParams)]
pub struct InitializeMockOracle<'info> {
    #[account(seeds = [State::SEED], bump = state.bump, has_one = admin)]
    pub state: Box<Account<'info, State>>,

    #[account(
        init,
        payer = admin,
        space = 8 + MockOracle::INIT_SPACE,
        seeds = [MockOracle::SEED, params.market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub mock_oracle: Account<'info, MockOracle>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_mock_oracle(
    ctx: Context<InitializeMockOracle>,
    params: InitializeMockOracleParams,
) -> Result<()> {
    let mock = &mut ctx.accounts.mock_oracle;
    mock.market_index = params.market_index;
    mock.authority = ctx.accounts.admin.key();
    mock.price = params.price;
    mock.conf = params.conf;
    mock.last_update_ts = Clock::get()?.unix_timestamp;
    mock.bump = ctx.bumps.mock_oracle;

    msg!(
        "mock oracle init mkt={} price={} conf={}",
        params.market_index,
        params.price,
        params.conf
    );
    Ok(())
}
