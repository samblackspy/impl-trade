//! Anchor events emitted for off-chain indexing. The indexer decodes these from program
//! logs (via the IDL/event coder) into Postgres — far more robust than parsing `msg!` text.

use anchor_lang::prelude::*;

#[event]
pub struct TradeRecord {
    pub user: Pubkey,
    pub market_index: u16,
    /// Direction of the fill (true = long/buy base).
    pub is_long: bool,
    /// Whether this reduced/closed a position (vs opened/increased).
    pub is_close: bool,
    pub base_amount: u64,  // BASE_PRECISION
    pub quote_amount: u64, // QUOTE_PRECISION
    pub price: u64,        // average fill price, PRICE_PRECISION
    pub fee: u64,          // QUOTE_PRECISION
    pub ts: i64,
}

#[event]
pub struct FundingRecord {
    pub market_index: u16,
    pub rate: i128,
    pub cumulative: i128,
    pub mark_twap: u64,
    pub oracle_twap: u64,
    pub ts: i64,
}

#[event]
pub struct LiquidationRecord {
    pub user: Pubkey,
    pub market_index: u16,
    pub liquidator: Pubkey,
    pub base_closed: u64,
    pub liq_fee: u64,
    pub ts: i64,
}
