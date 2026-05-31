//! `InsuranceFund` — backstops bad debt from underwater liquidations.

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default, Debug)]
pub struct InsuranceFund {
    /// Total shares outstanding (for future LP staking; admin-seeded on devnet).
    pub total_shares: u128,
    /// Total quote deposited, QUOTE_PRECISION.
    pub total_deposits: u64,
    pub bump: u8,
}

impl InsuranceFund {
    pub const SEED: &'static [u8] = b"insurance_fund";
}
