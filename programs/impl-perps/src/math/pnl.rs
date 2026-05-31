//! Profit-and-loss math.
//!
//! We track `quote_entry_amount` as a *signed cost basis*: negative when the trader paid
//! quote to go long, positive when they received quote to go short. With that convention
//! `uPnL = base_value + quote_entry_amount`, which is sign-correct for both sides:
//!
//! - Long 1 SOL @ $100 (entry = -100), price -> $120, base_value = +120, pnl = +20.
//! - Short 1 SOL @ $100 (entry = +100), price -> $80, base_value = -80, pnl = +20.

use crate::constants::*;
use crate::math::safe::SafeMath;
use crate::state::PerpPosition;
use anchor_lang::prelude::*;

/// Signed quote value of a base amount at `oracle_price` (QUOTE_PRECISION).
pub fn base_asset_value(base_asset_amount: i64, oracle_price: u64) -> Result<i128> {
    (base_asset_amount as i128)
        .safe_mul(oracle_price as i128)?
        .safe_div(BASE_PRECISION_I128)
}

/// Unrealized PnL of a position at `oracle_price` (QUOTE_PRECISION, signed).
pub fn unrealized_pnl(position: &PerpPosition, oracle_price: u64) -> Result<i128> {
    base_asset_value(position.base_asset_amount, oracle_price)?
        .safe_add(position.quote_entry_amount as i128)
}
