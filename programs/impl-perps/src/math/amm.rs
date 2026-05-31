//! Virtual AMM (vAMM) math — constant product `base * quote = k` with a `peg_multiplier`
//! that scales the quote/base ratio into price units.
//!
//! Reserves are virtual (no tokens held), in `AMM_RESERVE_PRECISION` (1e9). Position
//! base amounts share that precision, so a base delta maps 1:1 onto a reserve delta.
//!
//! Mark price (PRICE_PRECISION) = quote_asset_reserve * peg_multiplier / base_asset_reserve.

use crate::constants::*;
use crate::errors::ErrorCode;
use crate::math::safe::{cast_u64, div_ceil, SafeMath};
use crate::state::{Amm, PositionDirection};
use anchor_lang::prelude::*;

/// Which way the *base reserve* moves. Buying base (going long) removes base from the
/// reserve; selling base (going short) adds base to it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SwapDirection {
    /// Base reserve increases (trader sells base / goes short).
    Add,
    /// Base reserve decreases (trader buys base / goes long).
    Remove,
}

/// The reserve change implied by a *buy/sell* of base. A Long trade buys base (Remove);
/// a Short trade sells base (Add).
pub fn swap_direction_for_buy(is_buy: bool) -> SwapDirection {
    if is_buy {
        SwapDirection::Remove
    } else {
        SwapDirection::Add
    }
}

/// Mark price in PRICE_PRECISION from raw reserves.
pub fn reserve_price(
    base_asset_reserve: u128,
    quote_asset_reserve: u128,
    peg_multiplier: u128,
) -> Result<u64> {
    let price = quote_asset_reserve
        .safe_mul(peg_multiplier)?
        .safe_div(base_asset_reserve)?;
    cast_u64(price)
}

/// Convenience wrapper over an `Amm`.
pub fn mark_price(amm: &Amm) -> Result<u64> {
    reserve_price(
        amm.base_asset_reserve,
        amm.quote_asset_reserve,
        amm.peg_multiplier,
    )
}

/// Result of moving the AMM along the curve.
#[derive(Clone, Copy, Debug)]
pub struct SwapResult {
    pub new_base_reserve: u128,
    pub new_quote_reserve: u128,
    /// Quote amount swapped, QUOTE_PRECISION (always non-negative magnitude).
    pub quote_amount: u128,
}

/// Move `base_amount` (magnitude, AMM_RESERVE_PRECISION) along the constant-product curve.
///
/// Rounding: `new_quote_reserve` is rounded **up** so the invariant never decreases. That
/// means a buyer pays slightly more and a seller receives slightly less — always in the
/// protocol's favor, never the user's.
pub fn calculate_swap(
    base_asset_reserve: u128,
    quote_asset_reserve: u128,
    peg_multiplier: u128,
    base_amount: u128,
    direction: SwapDirection,
) -> Result<SwapResult> {
    require!(base_amount > 0, ErrorCode::InvalidAmount);
    let invariant = base_asset_reserve.safe_mul(quote_asset_reserve)?;

    let new_base_reserve = match direction {
        SwapDirection::Add => base_asset_reserve.safe_add(base_amount)?,
        SwapDirection::Remove => base_asset_reserve.safe_sub(base_amount)?,
    };
    require!(new_base_reserve > 0, ErrorCode::MathOverflow);

    // Round up so invariant_after = new_base * new_quote >= k (no value leaks to traders).
    let new_quote_reserve = div_ceil(invariant, new_base_reserve)?;

    let quote_reserve_delta = match direction {
        // Remove base (buy): quote reserve rises; delta = quote paid by trader.
        SwapDirection::Remove => new_quote_reserve.safe_sub(quote_asset_reserve)?,
        // Add base (sell): quote reserve falls; delta = quote received by trader.
        SwapDirection::Add => quote_asset_reserve.safe_sub(new_quote_reserve)?,
    };

    // Convert reserve units (1e9) to quote (1e6) via peg: delta * peg / AMM_RESERVE_PRECISION.
    let quote_amount = quote_reserve_delta
        .safe_mul(peg_multiplier)?
        .safe_div(AMM_RESERVE_PRECISION)?;

    Ok(SwapResult {
        new_base_reserve,
        new_quote_reserve,
        quote_amount,
    })
}

/// Initialize balanced reserves so that mark price == `peg_multiplier` (the starting
/// price). `reserve` is the per-side depth (also `sqrt_k`): larger => less slippage.
pub fn initial_reserves(reserve: u128, peg_multiplier: u128) -> Result<Amm> {
    require!(reserve > 0 && peg_multiplier > 0, ErrorCode::InvalidAmount);
    Ok(Amm {
        base_asset_reserve: reserve,
        quote_asset_reserve: reserve,
        sqrt_k: reserve,
        peg_multiplier,
        ..Default::default()
    })
}

/// For a trade in `direction` (the resulting/closing position direction), is the trader
/// buying base? Long opens and short closes are buys.
pub fn is_buy(trade_direction: PositionDirection) -> bool {
    matches!(trade_direction, PositionDirection::Long)
}
