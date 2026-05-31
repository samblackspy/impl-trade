//! `MockOracle` — a program-owned price account for **local/dev only**.
//!
//! On a real cluster the market reads a Pyth `PriceUpdateV2` (see `crate::oracle`). But a
//! local `solana-test-validator` has no Pyth receiver program, and a cloned price account
//! would be frozen + stale within seconds (the program rejects stale prices). To run the
//! full stack locally with a price we can *move* (to demo PnL, funding and liquidations),
//! a market can instead point at a `MockOracle` that an authority pushes prices into.
//!
//! This source is gated by `Market::oracle_source == OracleSource::Mock` and must never be
//! used on mainnet — there is no cryptographic provenance, just an authority writing a number.

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default, Debug)]
pub struct MockOracle {
    pub market_index: u16,
    /// The only key allowed to push new prices.
    pub authority: Pubkey,
    /// Price in `PRICE_PRECISION` (1e6).
    pub price: u64,
    /// Confidence in `PRICE_PRECISION` (1e6).
    pub conf: u64,
    /// Wall-clock of the last push — used for the same staleness guard as Pyth.
    pub last_update_ts: i64,
    pub bump: u8,
}

impl MockOracle {
    pub const SEED: &'static [u8] = b"mock_oracle";
}
