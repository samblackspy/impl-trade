//! Fixed-point precision constants and protocol-wide defaults.
//!
//! Everything in the program is integer fixed-point. The precisions below are the
//! single source of truth — never hardcode `1_000_000` inline. Mixed-precision math
//! (e.g. base × price) is centralized in `crate::math` so the scaling is auditable.

/// Price precision: prices are integers scaled by 1e6 (e.g. $150.25 -> 150_250_000).
pub const PRICE_PRECISION: u128 = 1_000_000;
pub const PRICE_PRECISION_I128: i128 = 1_000_000;

/// Quote (USDC) precision: 6 decimals.
pub const QUOTE_PRECISION: u128 = 1_000_000;
pub const QUOTE_PRECISION_I128: i128 = 1_000_000;
pub const QUOTE_PRECISION_U64: u64 = 1_000_000;

/// Base asset precision: positions sized in 1e9.
pub const BASE_PRECISION: u128 = 1_000_000_000;
pub const BASE_PRECISION_I128: i128 = 1_000_000_000;

/// AMM virtual reserves precision (1e9). Reserves are stored in this precision; the
/// `peg_multiplier` (PEG_PRECISION) scales the quote/base ratio into PRICE_PRECISION.
pub const AMM_RESERVE_PRECISION: u128 = 1_000_000_000;

/// Peg multiplier precision (1e6).
pub const PEG_PRECISION: u128 = 1_000_000;

/// Margin ratios are in 1e4 (10_000 = 100%). e.g. 1_000 = 10% initial => 10x max.
pub const MARGIN_PRECISION: u128 = 10_000;
pub const MARGIN_PRECISION_U128: u128 = 10_000;

/// General percentage / rate precision (1e6) for fees and funding math.
pub const PERCENTAGE_PRECISION: u128 = 1_000_000;
pub const PERCENTAGE_PRECISION_I128: i128 = 1_000_000;

/// Basis-points denominator (10_000 = 100%).
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const BPS_DENOMINATOR_I128: i128 = 10_000;

/// Funding-rate precision (1e9).
pub const FUNDING_RATE_PRECISION: i128 = 1_000_000_000;

/// Per-period funding-rate clamp (0.5% of the index price per funding period) — a safety
/// rail against oracle/mark anomalies driving a runaway funding payment.
pub const MAX_FUNDING_RATE: i128 = FUNDING_RATE_PRECISION * 5 / 1000;

/// Fixed-size capacity of the per-user positions / orders arrays.
pub const MAX_POSITIONS: usize = 8;
pub const MAX_ORDERS: usize = 32;

/// Default oracle guard rails.
pub const DEFAULT_MAX_ORACLE_STALENESS_SECONDS: u64 = 60;
pub const DEFAULT_MAX_ORACLE_CONFIDENCE_BPS: u64 = 200; // reject if conf > 2% of price

/// Default funding period (1 hour, in seconds).
pub const FUNDING_PERIOD_SECONDS: i64 = 3600;
