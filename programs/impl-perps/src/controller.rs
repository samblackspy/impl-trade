//! Shared trade execution against the vAMM. Used by market orders (`open_position`) and
//! keeper-filled limit orders (`fill_perp_order`) so both paths price and book-keep
//! identically. This handles the opening/increasing direction; reduce/close lives in the
//! close + liquidation paths.

use crate::constants::*;
use crate::errors::ErrorCode;
use crate::events::TradeRecord;
use crate::math::amm::{calculate_swap, SwapDirection};
use crate::math::margin::{fee_amount, MarginCalculation};
use crate::math::safe::{cast_i64, cast_u64, SafeMath};
use crate::state::{Market, PositionDirection, User};
use anchor_lang::prelude::*;

/// Open/increase `base_amount` in `direction` against the AMM. `price_limit`
/// (PRICE_PRECISION, 0 = none) caps the average fill price (max for a long, min for a
/// short). Pays the taker fee from collateral and enforces initial margin on the result.
/// Returns the quote amount swapped.
pub fn execute_amm_open(
    user: &mut User,
    market: &mut Market,
    taker_fee_bps: u16,
    direction: PositionDirection,
    base_amount: u64,
    price_limit: u64,
    oracle_price: u64,
) -> Result<u128> {
    require!(base_amount > 0, ErrorCode::InvalidAmount);
    let is_long = direction == PositionDirection::Long;
    let swap_dir = if is_long {
        SwapDirection::Remove
    } else {
        SwapDirection::Add
    };
    let swap = calculate_swap(
        market.amm.base_asset_reserve,
        market.amm.quote_asset_reserve,
        market.amm.peg_multiplier,
        base_amount as u128,
        swap_dir,
    )?;

    let avg_price = swap
        .quote_amount
        .safe_mul(BASE_PRECISION)?
        .safe_div(base_amount as u128)?;
    if price_limit > 0 {
        let limit = price_limit as u128;
        if is_long {
            require!(avg_price <= limit, ErrorCode::SlippageExceeded);
        } else {
            require!(avg_price >= limit, ErrorCode::SlippageExceeded);
        }
    }

    let fee = fee_amount(swap.quote_amount, taker_fee_bps)?;
    let quote_i64 = cast_i64(swap.quote_amount as i128)?;
    let signed_base = if is_long {
        base_amount as i64
    } else {
        -(base_amount as i64)
    };

    // --- EFFECTS ---
    market.amm.base_asset_reserve = swap.new_base_reserve;
    market.amm.quote_asset_reserve = swap.new_quote_reserve;

    require!(
        (user.collateral as u128) >= fee,
        ErrorCode::InsufficientCollateral
    );
    let pos_idx = if let Some(i) = user.find_position(market.market_index) {
        require!(
            (user.positions[i].base_asset_amount > 0) == is_long,
            ErrorCode::ReduceOnlyViolation
        );
        i
    } else {
        user.get_or_create_position(market.market_index)?
    };
    {
        let pos = &mut user.positions[pos_idx];
        if pos.base_asset_amount == 0 {
            pos.last_cumulative_funding_rate = market.amm.cumulative_funding_rate_long;
        }
        pos.base_asset_amount = pos.base_asset_amount.safe_add(signed_base)?;
        pos.quote_entry_amount = if is_long {
            pos.quote_entry_amount.safe_sub(quote_i64)?
        } else {
            pos.quote_entry_amount.safe_add(quote_i64)?
        };
    }
    user.collateral = user.collateral.safe_sub(cast_u64(fee)?)?;

    if is_long {
        market.open_interest_long = market.open_interest_long.safe_add(base_amount as u128)?;
        market.amm.base_asset_amount_long = market
            .amm
            .base_asset_amount_long
            .safe_add(base_amount as i128)?;
    } else {
        market.open_interest_short = market.open_interest_short.safe_add(base_amount as u128)?;
        market.amm.base_asset_amount_short = market
            .amm
            .base_asset_amount_short
            .safe_sub(base_amount as i128)?;
    }
    market.amm.total_fee = market.amm.total_fee.safe_add(fee as i128)?;

    let total_oi = market
        .open_interest_long
        .safe_add(market.open_interest_short)?;
    require!(
        market.max_open_interest == 0 || total_oi <= market.max_open_interest,
        ErrorCode::MaxOpenInterestExceeded
    );

    // POST-CONDITION: account meets initial margin (reverts everything otherwise).
    let mut margin = MarginCalculation::new(user.collateral);
    margin.add_position(
        &user.positions[pos_idx],
        oracle_price,
        market.margin_ratio_initial,
        market.margin_ratio_maintenance,
    )?;
    margin.require_initial()?;

    emit!(TradeRecord {
        user: user.authority,
        market_index: market.market_index,
        is_long,
        is_close: false,
        base_amount,
        quote_amount: cast_u64(swap.quote_amount)?,
        price: cast_u64(avg_price)?,
        fee: cast_u64(fee)?,
        ts: Clock::get()?.unix_timestamp,
    });

    Ok(swap.quote_amount)
}

/// Reduce/close `close_base` of the position at `pos_idx` against the AMM, realizing PnL into
/// collateral. Shared by `close_position` (user-initiated) and `trigger_order` (keeper SL/TP).
/// `price_limit` (PRICE_PRECISION, 0 = none): min avg price when closing a long, max when
/// closing a short. A close cannot push the account into bad debt — it reverts if it would
/// (that path is liquidation). Returns realized PnL (QUOTE_PRECISION, signed).
pub fn execute_amm_close(
    user: &mut User,
    market: &mut Market,
    taker_fee_bps: u16,
    pos_idx: usize,
    close_base: u64,
    price_limit: u64,
) -> Result<i128> {
    let base_before = user.positions[pos_idx].base_asset_amount;
    require!(base_before != 0, ErrorCode::PositionNotFound);
    let pos_is_long = base_before > 0;
    let abs_base = base_before.unsigned_abs();
    require!(
        close_base > 0 && close_base <= abs_base,
        ErrorCode::InvalidAmount
    );
    let quote_entry_before = user.positions[pos_idx].quote_entry_amount;

    // Closing a long sells base (Add); closing a short buys base (Remove).
    let swap_dir = if pos_is_long {
        SwapDirection::Add
    } else {
        SwapDirection::Remove
    };
    let swap = calculate_swap(
        market.amm.base_asset_reserve,
        market.amm.quote_asset_reserve,
        market.amm.peg_multiplier,
        close_base as u128,
        swap_dir,
    )?;

    let avg_price = swap
        .quote_amount
        .safe_mul(BASE_PRECISION)?
        .safe_div(close_base as u128)?;
    if price_limit > 0 {
        let limit = price_limit as u128;
        if pos_is_long {
            require!(avg_price >= limit, ErrorCode::SlippageExceeded);
        } else {
            require!(avg_price <= limit, ErrorCode::SlippageExceeded);
        }
    }

    let fee = fee_amount(swap.quote_amount, taker_fee_bps)?;
    // Cost basis removed for the closed fraction, and realized PnL.
    let q_closed = (quote_entry_before as i128)
        .safe_mul(close_base as i128)?
        .safe_div(abs_base as i128)?;
    let quote_flow = if pos_is_long {
        swap.quote_amount as i128
    } else {
        -(swap.quote_amount as i128)
    };
    let realized = quote_flow.safe_add(q_closed)?;

    // --- EFFECTS ---
    market.amm.base_asset_reserve = swap.new_base_reserve;
    market.amm.quote_asset_reserve = swap.new_quote_reserve;
    {
        let pos = &mut user.positions[pos_idx];
        pos.base_asset_amount = if pos_is_long {
            pos.base_asset_amount.safe_sub(close_base as i64)?
        } else {
            pos.base_asset_amount.safe_add(close_base as i64)?
        };
        pos.quote_entry_amount = pos.quote_entry_amount.safe_sub(cast_i64(q_closed)?)?;
        if pos.base_asset_amount == 0 {
            pos.quote_entry_amount = 0; // clear dust on full close
        }
    }

    let new_collateral = (user.collateral as i128)
        .safe_add(realized)?
        .safe_sub(fee as i128)?;
    require!(new_collateral >= 0, ErrorCode::InsufficientCollateral);
    user.collateral = cast_u64(new_collateral as u128)?;
    user.settled_pnl = user.settled_pnl.safe_add(cast_i64(realized)?)?;

    if pos_is_long {
        market.open_interest_long = market.open_interest_long.saturating_sub(close_base as u128);
        market.amm.base_asset_amount_long = market
            .amm
            .base_asset_amount_long
            .safe_sub(close_base as i128)?;
    } else {
        market.open_interest_short = market
            .open_interest_short
            .saturating_sub(close_base as u128);
        market.amm.base_asset_amount_short = market
            .amm
            .base_asset_amount_short
            .safe_add(close_base as i128)?;
    }
    market.amm.total_fee = market.amm.total_fee.safe_add(fee as i128)?;

    emit!(TradeRecord {
        user: user.authority,
        market_index: market.market_index,
        is_long: pos_is_long,
        is_close: true,
        base_amount: close_base,
        quote_amount: cast_u64(swap.quote_amount)?,
        price: cast_u64(avg_price)?,
        fee: cast_u64(fee)?,
        ts: Clock::get()?.unix_timestamp,
    });

    Ok(realized)
}

/// Apply one opening leg of a peer match to `user`: increase the position by `base` in
/// `direction` at `fill_price`-implied `quote`, adjust collateral by `collateral_delta`
/// (negative = taker fee paid, positive = maker rebate received), bump open interest, and
/// enforce initial margin. No AMM reserves move — this is a peer fill.
fn apply_match_leg(
    user: &mut User,
    market: &mut Market,
    direction: PositionDirection,
    base: u64,
    quote: u128,
    collateral_delta: i64,
    oracle_price: u64,
) -> Result<()> {
    let is_long = direction == PositionDirection::Long;
    let signed_base = if is_long { base as i64 } else { -(base as i64) };
    let quote_i64 = cast_i64(quote as i128)?;

    let new_collateral = (user.collateral as i128).safe_add(collateral_delta as i128)?;
    require!(new_collateral >= 0, ErrorCode::InsufficientCollateral);

    let pos_idx = if let Some(i) = user.find_position(market.market_index) {
        require!(
            (user.positions[i].base_asset_amount > 0) == is_long,
            ErrorCode::ReduceOnlyViolation
        );
        i
    } else {
        user.get_or_create_position(market.market_index)?
    };
    {
        let pos = &mut user.positions[pos_idx];
        if pos.base_asset_amount == 0 {
            pos.last_cumulative_funding_rate = market.amm.cumulative_funding_rate_long;
        }
        pos.base_asset_amount = pos.base_asset_amount.safe_add(signed_base)?;
        pos.quote_entry_amount = if is_long {
            pos.quote_entry_amount.safe_sub(quote_i64)?
        } else {
            pos.quote_entry_amount.safe_add(quote_i64)?
        };
    }
    user.collateral = cast_u64(new_collateral as u128)?;

    if is_long {
        market.open_interest_long = market.open_interest_long.safe_add(base as u128)?;
        market.amm.base_asset_amount_long =
            market.amm.base_asset_amount_long.safe_add(base as i128)?;
    } else {
        market.open_interest_short = market.open_interest_short.safe_add(base as u128)?;
        market.amm.base_asset_amount_short =
            market.amm.base_asset_amount_short.safe_sub(base as i128)?;
    }

    let mut margin = MarginCalculation::new(user.collateral);
    margin.add_position(
        &user.positions[pos_idx],
        oracle_price,
        market.margin_ratio_initial,
        market.margin_ratio_maintenance,
    )?;
    margin.require_initial()?;
    Ok(())
}

/// Cross a taker order against a resting maker order at the **maker's price** (price priority).
/// Both legs open/increase (opposite directions); the taker pays `taker_fee_bps`, the maker
/// earns `maker_rebate_bps`, and the net accrues to the market. No AMM reserves move.
#[allow(clippy::too_many_arguments)]
pub fn execute_maker_match(
    taker: &mut User,
    maker: &mut User,
    market: &mut Market,
    taker_fee_bps: u16,
    maker_rebate_bps: u16,
    taker_direction: PositionDirection,
    base: u64,
    fill_price: u64,
    oracle_price: u64,
) -> Result<()> {
    require!(base > 0, ErrorCode::InvalidAmount);
    let quote = (base as u128)
        .safe_mul(fill_price as u128)?
        .safe_div(BASE_PRECISION)?;
    let taker_fee = fee_amount(quote, taker_fee_bps)?;
    let maker_rebate = fee_amount(quote, maker_rebate_bps)?;
    let maker_direction = if taker_direction == PositionDirection::Long {
        PositionDirection::Short
    } else {
        PositionDirection::Long
    };

    apply_match_leg(
        taker,
        market,
        taker_direction,
        base,
        quote,
        -cast_i64(taker_fee as i128)?,
        oracle_price,
    )?;
    apply_match_leg(
        maker,
        market,
        maker_direction,
        base,
        quote,
        cast_i64(maker_rebate as i128)?,
        oracle_price,
    )?;

    let total_oi = market
        .open_interest_long
        .safe_add(market.open_interest_short)?;
    require!(
        market.max_open_interest == 0 || total_oi <= market.max_open_interest,
        ErrorCode::MaxOpenInterestExceeded
    );
    market.amm.total_fee = market
        .amm
        .total_fee
        .safe_add(taker_fee as i128)?
        .safe_sub(maker_rebate as i128)?;

    let ts = Clock::get()?.unix_timestamp;
    emit!(TradeRecord {
        user: taker.authority,
        market_index: market.market_index,
        is_long: taker_direction == PositionDirection::Long,
        is_close: false,
        base_amount: base,
        quote_amount: cast_u64(quote)?,
        price: fill_price,
        fee: cast_u64(taker_fee)?,
        ts,
    });
    emit!(TradeRecord {
        user: maker.authority,
        market_index: market.market_index,
        is_long: maker_direction == PositionDirection::Long,
        is_close: false,
        base_amount: base,
        quote_amount: cast_u64(quote)?,
        price: fill_price,
        fee: 0, // maker earns a rebate, recorded in collateral
        ts,
    });
    Ok(())
}
