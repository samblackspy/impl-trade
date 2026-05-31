//! Liquidation math (the full liquidation flow lands in Phase 2).

use crate::constants::*;
use crate::math::safe::SafeMath;
use anchor_lang::prelude::*;

/// An account is liquidatable when total collateral falls below the maintenance
/// margin requirement.
pub fn is_liquidatable(total_collateral: i128, maintenance_margin_requirement: u128) -> bool {
    total_collateral < maintenance_margin_requirement as i128
}

/// Liquidation fee on a (partial) close, QUOTE_PRECISION = notional * fee_bps / 10_000.
pub fn liquidation_fee(notional: u128, fee_bps: u16) -> Result<u128> {
    notional
        .safe_mul(fee_bps as u128)?
        .safe_div(BPS_DENOMINATOR)
}

/// Approximate liquidation price for UI/keeper hints (PRICE_PRECISION). For a position
/// with `entry_price` and effective leverage `L`, maintenance is breached around:
///   long:  entry * (1 - 1/L + mmr)
///   short: entry * (1 + 1/L - mmr)
/// This is a hint only; the on-chain check uses full account health, not this number.
pub fn approx_liquidation_price(
    entry_price: u64,
    leverage_x: u64,
    maintenance_margin_ratio: u32,
    is_long: bool,
) -> Result<u64> {
    require!(leverage_x > 0, crate::errors::ErrorCode::InvalidAmount);
    let entry = entry_price as i128;
    // 1/L and mmr both expressed in MARGIN_PRECISION.
    let inv_lev = (MARGIN_PRECISION as i128).safe_div(leverage_x as i128)?;
    let mmr = maintenance_margin_ratio as i128;
    let factor = if is_long {
        (MARGIN_PRECISION as i128)
            .safe_sub(inv_lev)?
            .safe_add(mmr)?
    } else {
        (MARGIN_PRECISION as i128)
            .safe_add(inv_lev)?
            .safe_sub(mmr)?
    };
    let price = entry.safe_mul(factor)?.safe_div(MARGIN_PRECISION as i128)?;
    crate::math::safe::cast_u64(price.max(0) as u128)
}
