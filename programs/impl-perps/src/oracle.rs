//! Pyth pull-oracle integration.
//!
//! Reads a `PriceUpdateV2` account and returns a price normalized to `PRICE_PRECISION`
//! (1e6), after validating — per the DeFi security checklist:
//!   1. feed id matches the market's expected feed,
//!   2. price is fresh (publish time within `max_age_seconds`),
//!   3. confidence interval is tight (conf <= `max_confidence_bps` of price),
//!   4. price is positive.
//! Any failure aborts the instruction — there is no "use a stale price anyway" path.

use crate::constants::*;
use crate::errors::ErrorCode;
use crate::math::safe::{cast_u64, SafeMath};
use crate::state::{MockOracle, OracleSource};
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Clone, Copy, Debug)]
pub struct OraclePrice {
    /// Price in PRICE_PRECISION (1e6).
    pub price: u64,
    /// Confidence in PRICE_PRECISION (1e6).
    pub confidence: u64,
    pub publish_time: i64,
}

/// Read + validate the index price from a market's oracle account, dispatching on the
/// market's `OracleSource`. The account is passed as a raw `AccountInfo` because its type
/// depends on the source; we deserialize (and owner-check, via `Account::try_from`) the
/// correct type here. Callers must still constrain `oracle_ai.key() == market.oracle`
/// (done declaratively with `#[account(address = market.oracle)]`).
pub fn load_oracle_price(
    source: OracleSource,
    oracle_ai: &AccountInfo,
    expected_feed_id: &[u8; 32],
    max_age_seconds: u64,
    max_confidence_bps: u64,
    clock: &Clock,
) -> Result<OraclePrice> {
    match source {
        OracleSource::Pyth => {
            // Owner + discriminator check (what `Account::try_from` does, lifetime-free).
            require!(
                oracle_ai.owner == &PriceUpdateV2::owner(),
                ErrorCode::InvalidOracleFeed
            );
            let data = oracle_ai.try_borrow_data()?;
            let mut buf: &[u8] = &data[..];
            let price_update = PriceUpdateV2::try_deserialize(&mut buf)
                .map_err(|_| error!(ErrorCode::InvalidOracleFeed))?;
            get_oracle_price(
                &price_update,
                expected_feed_id,
                max_age_seconds,
                max_confidence_bps,
                clock,
            )
        }
        OracleSource::Mock => {
            require!(oracle_ai.owner == &crate::ID, ErrorCode::InvalidOracleFeed);
            let data = oracle_ai.try_borrow_data()?;
            let mut buf: &[u8] = &data[..];
            let mock = MockOracle::try_deserialize(&mut buf)
                .map_err(|_| error!(ErrorCode::InvalidOracleFeed))?;
            read_mock_oracle(&mock, max_age_seconds, max_confidence_bps, clock)
        }
    }
}

/// Validate a program-owned `MockOracle` with the same freshness/confidence rails as Pyth.
fn read_mock_oracle(
    mock: &MockOracle,
    max_age_seconds: u64,
    max_confidence_bps: u64,
    clock: &Clock,
) -> Result<OraclePrice> {
    require!(mock.price > 0, ErrorCode::InvalidOraclePrice);

    // Freshness: the authority must have pushed within `max_age_seconds`.
    let age = clock.unix_timestamp.safe_sub(mock.last_update_ts)?;
    require!(
        age >= 0 && (age as u64) <= max_age_seconds,
        ErrorCode::StaleOracle
    );

    // Confidence guard rail, identical rule to the Pyth path.
    let max_conf = (mock.price as u128)
        .safe_mul(max_confidence_bps as u128)?
        .safe_div(BPS_DENOMINATOR)?;
    require!(
        (mock.conf as u128) <= max_conf,
        ErrorCode::OracleConfidenceTooWide
    );

    Ok(OraclePrice {
        price: mock.price,
        confidence: mock.conf,
        publish_time: mock.last_update_ts,
    })
}

/// Validate + normalize a Pyth price. `clock` is `Clock::get()?` from the caller.
pub fn get_oracle_price(
    price_update: &PriceUpdateV2,
    expected_feed_id: &[u8; 32],
    max_age_seconds: u64,
    max_confidence_bps: u64,
    clock: &Clock,
) -> Result<OraclePrice> {
    // (1) feed id must match the market.
    require!(
        &price_update.price_message.feed_id == expected_feed_id,
        ErrorCode::InvalidOracleFeed
    );

    // (2) freshness — Pyth's own staleness check against publish time.
    let price = price_update
        .get_price_no_older_than(clock, max_age_seconds, expected_feed_id)
        .map_err(|_| error!(ErrorCode::StaleOracle))?;

    // (4) positive price.
    require!(price.price > 0, ErrorCode::InvalidOraclePrice);

    let normalized = normalize_to_price_precision(price.price as i128, price.exponent)?;
    let normalized_conf = normalize_to_price_precision(price.conf as i128, price.exponent)?;

    // (3) confidence guard rail: conf must be within max_confidence_bps of price.
    let max_conf = (normalized as u128)
        .safe_mul(max_confidence_bps as u128)?
        .safe_div(BPS_DENOMINATOR)?;
    require!(
        (normalized_conf as u128) <= max_conf,
        ErrorCode::OracleConfidenceTooWide
    );

    Ok(OraclePrice {
        price: normalized,
        confidence: normalized_conf,
        publish_time: price.publish_time,
    })
}

/// Convert a Pyth `(value, exponent)` pair (value = mantissa, true price = value·10^exp)
/// to PRICE_PRECISION (1e6). target_exp = exponent + 6.
fn normalize_to_price_precision(value: i128, exponent: i32) -> Result<u64> {
    require!(value >= 0, ErrorCode::InvalidOraclePrice);
    let value = value as u128;
    let target_exp = exponent + 6;

    let normalized = if target_exp >= 0 {
        let factor = 10u128
            .checked_pow(target_exp as u32)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?;
        value.safe_mul(factor)?
    } else {
        let factor = 10u128
            .checked_pow((-target_exp) as u32)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?;
        value.safe_div(factor)?
    };
    cast_u64(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_typical_pyth_exponent() {
        // $150.00000000 reported with exponent -8 -> 150_000_000 in 1e6.
        assert_eq!(
            normalize_to_price_precision(15_000_000_000, -8).unwrap(),
            150_000_000
        );
    }

    #[test]
    fn normalize_when_already_1e6() {
        assert_eq!(
            normalize_to_price_precision(150_000_000, -6).unwrap(),
            150_000_000
        );
    }

    #[test]
    fn normalize_positive_exponent_path() {
        // value 3 with exponent +1 => 30.0 true => 30_000_000 in 1e6.
        assert_eq!(normalize_to_price_precision(3, 1).unwrap(), 30_000_000);
    }
}
