//! `update_mock_oracle` — the authority pushes a fresh price into a `MockOracle`.
//!
//! Run on a loop by a local price pusher so the index moves (enabling PnL, funding and
//! liquidation demos on a `solana-test-validator`). **Local/dev only.**

use crate::errors::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateMockOracleParams {
    /// New price in PRICE_PRECISION (1e6).
    pub price: u64,
    /// New confidence in PRICE_PRECISION (1e6).
    pub conf: u64,
}

#[derive(Accounts)]
pub struct UpdateMockOracle<'info> {
    #[account(
        mut,
        seeds = [MockOracle::SEED, mock_oracle.market_index.to_le_bytes().as_ref()],
        bump = mock_oracle.bump,
        has_one = authority
    )]
    pub mock_oracle: Account<'info, MockOracle>,

    pub authority: Signer<'info>,
}

pub fn update_mock_oracle(
    ctx: Context<UpdateMockOracle>,
    params: UpdateMockOracleParams,
) -> Result<()> {
    require!(params.price > 0, ErrorCode::InvalidOraclePrice);
    let mock = &mut ctx.accounts.mock_oracle;
    mock.price = params.price;
    mock.conf = params.conf;
    mock.last_update_ts = Clock::get()?.unix_timestamp;
    Ok(())
}
