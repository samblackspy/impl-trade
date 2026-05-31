//! Funding-rate math (wired into instructions in Phase 2).
//!
//! Funding nudges the perp mark price toward the oracle (index) price. Each period the
//! rate is `(mark_twap − oracle_twap) / oracle_twap`, scaled by `period / 24h` and
//! clamped. The market accumulates a per-base funding figure; a position settles the
//! delta since it last paid. Longs pay shorts when the perp trades above index.

use crate::constants::*;
use crate::math::safe::{cast_u64, SafeMath};
use anchor_lang::prelude::*;

/// Funding rate for the period in `FUNDING_RATE_PRECISION` (a signed fraction), clamped
/// to ±`max_abs_rate`.
pub fn calculate_funding_rate(
    mark_twap: u64,
    oracle_twap: u64,
    funding_period: i64,
    max_abs_rate: i128,
) -> Result<i128> {
    require!(
        oracle_twap > 0,
        crate::errors::ErrorCode::InvalidOraclePrice
    );

    let price_diff = (mark_twap as i128).safe_sub(oracle_twap as i128)?;
    let rate = price_diff
        .safe_mul(FUNDING_RATE_PRECISION)?
        .safe_div(oracle_twap as i128)?;

    // Scale by the fraction of a day this period covers.
    let day_seconds: i128 = 24 * 3600;
    let scaled = rate
        .safe_mul(funding_period as i128)?
        .safe_div(day_seconds)?;

    Ok(scaled.clamp(-max_abs_rate, max_abs_rate))
}

/// Quote owed per 1.0 base for the period (QUOTE_PRECISION, signed):
/// `funding_rate * oracle_price / FUNDING_RATE_PRECISION`.
pub fn funding_delta_per_base(funding_rate: i128, oracle_price: u64) -> Result<i128> {
    funding_rate
        .safe_mul(oracle_price as i128)?
        .safe_div(FUNDING_RATE_PRECISION)
}

/// Funding payment owed by a position (QUOTE_PRECISION, signed; positive = user pays):
/// `base_asset_amount * (cumulative_now − cumulative_last) / BASE_PRECISION`.
pub fn funding_payment(
    base_asset_amount: i64,
    cumulative_now: i128,
    cumulative_last: i128,
) -> Result<i128> {
    let delta = cumulative_now.safe_sub(cumulative_last)?;
    (base_asset_amount as i128)
        .safe_mul(delta)?
        .safe_div(BASE_PRECISION_I128)
}

/// Time-weighted update of `twap_old` toward `current` over a `window`-second horizon.
/// Returns `current` on first use (twap_old == 0) or when no time has elapsed.
pub fn update_twap(twap_old: u64, current: u64, elapsed: i64, window: i64) -> Result<u64> {
    if elapsed <= 0 || twap_old == 0 {
        return Ok(current);
    }
    let window = (window.max(1)) as u128;
    let weight = (elapsed as u128).min(window);
    let blended = (twap_old as u128)
        .safe_mul(window.safe_sub(weight)?)?
        .safe_add((current as u128).safe_mul(weight)?)?
        .safe_div(window)?;
    cast_u64(blended)
}
