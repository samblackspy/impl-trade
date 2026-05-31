//! Unit tests for the pure math core. Run with `cargo test -p impl-perps`.

use crate::constants::*;
use crate::math::*;
use crate::state::*;

const ONE_SOL: i64 = 1_000_000_000; // 1.0 in BASE_PRECISION

fn px(dollars: u64) -> u64 {
    dollars * 1_000_000
} // PRICE_PRECISION
fn usd(dollars: i64) -> i64 {
    dollars * 1_000_000
} // QUOTE_PRECISION

fn position(base: i64, entry_quote: i64) -> PerpPosition {
    PerpPosition {
        market_index: 0,
        base_asset_amount: base,
        quote_entry_amount: entry_quote,
        last_cumulative_funding_rate: 0,
        open_orders: 0,
    }
}

#[test]
fn div_ceil_works() {
    assert_eq!(div_ceil(10, 3).unwrap(), 4);
    assert_eq!(div_ceil(9, 3).unwrap(), 3);
    assert_eq!(div_ceil(0, 5).unwrap(), 0);
    assert!(div_ceil(5, 0).is_err());
}

#[test]
fn reserve_price_balanced_equals_peg() {
    let reserve = 1000u128 * AMM_RESERVE_PRECISION;
    let peg = 100u128 * PEG_PRECISION;
    assert_eq!(reserve_price(reserve, reserve, peg).unwrap(), px(100));
}

#[test]
fn swap_long_costs_about_notional_and_moves_price_up() {
    let reserve = 1000u128 * AMM_RESERVE_PRECISION; // $100k each side
    let peg = 100u128 * PEG_PRECISION;
    let res = calculate_swap(
        reserve,
        reserve,
        peg,
        AMM_RESERVE_PRECISION,
        SwapDirection::Remove,
    )
    .unwrap();

    // Buying 1 unit costs ~$100 plus small slippage, never less than notional.
    assert!(res.quote_amount >= 100 * QUOTE_PRECISION);
    assert!(res.quote_amount < 101 * QUOTE_PRECISION);

    // Base reserve falls, mark price rises.
    assert!(res.new_base_reserve < reserve);
    let new_price = reserve_price(res.new_base_reserve, res.new_quote_reserve, peg).unwrap();
    assert!(new_price > px(100));
}

#[test]
fn swap_short_receives_about_notional_and_moves_price_down() {
    let reserve = 1000u128 * AMM_RESERVE_PRECISION;
    let peg = 100u128 * PEG_PRECISION;
    let res = calculate_swap(
        reserve,
        reserve,
        peg,
        AMM_RESERVE_PRECISION,
        SwapDirection::Add,
    )
    .unwrap();

    // Selling 1 unit yields ~$100, never more than notional (rounding favors protocol).
    assert!(res.quote_amount <= 100 * QUOTE_PRECISION);
    assert!(res.quote_amount > 99 * QUOTE_PRECISION);

    assert!(res.new_base_reserve > reserve);
    let new_price = reserve_price(res.new_base_reserve, res.new_quote_reserve, peg).unwrap();
    assert!(new_price < px(100));
}

#[test]
fn pnl_long_and_short_signs() {
    let long = position(ONE_SOL, usd(-100)); // bought 1 @ $100
    assert_eq!(unrealized_pnl(&long, px(120)).unwrap(), usd(20) as i128);
    assert_eq!(unrealized_pnl(&long, px(90)).unwrap(), usd(-10) as i128);

    let short = position(-ONE_SOL, usd(100)); // sold 1 @ $100
    assert_eq!(unrealized_pnl(&short, px(80)).unwrap(), usd(20) as i128);
    assert_eq!(unrealized_pnl(&short, px(110)).unwrap(), usd(-10) as i128);
}

#[test]
fn margin_requirements_and_liquidation_threshold() {
    let mut market = Market::default();
    market.margin_ratio_initial = 1000; // 10% => 10x
    market.margin_ratio_maintenance = 500; // 5%

    let pos = position(ONE_SOL, usd(-100));

    // Healthy at entry: $20 collateral, 1 SOL @ $100 (uPnL 0).
    let mut m = MarginCalculation::new(usd(20) as u64);
    m.add_position(
        &pos,
        px(100),
        market.margin_ratio_initial,
        market.margin_ratio_maintenance,
    )
    .unwrap();
    assert_eq!(m.initial_margin_requirement, 10 * QUOTE_PRECISION);
    assert_eq!(m.maintenance_margin_requirement, 5 * QUOTE_PRECISION);
    assert!(m.meets_initial());
    assert!(m.meets_maintenance());
    assert_eq!(m.free_collateral().unwrap(), usd(10) as i128);

    // At $80: uPnL -$20 wipes collateral to 0 => liquidatable (MMR $4).
    let mut m2 = MarginCalculation::new(usd(20) as u64);
    m2.add_position(
        &pos,
        px(80),
        market.margin_ratio_initial,
        market.margin_ratio_maintenance,
    )
    .unwrap();
    assert_eq!(m2.total_collateral, 0);
    assert!(!m2.meets_maintenance());
    assert!(is_liquidatable(
        m2.total_collateral,
        m2.maintenance_margin_requirement
    ));
}

#[test]
fn funding_rate_and_payment_signs() {
    // Mark above oracle => positive funding => longs pay shorts.
    let rate = calculate_funding_rate(
        px(101),
        px(100),
        FUNDING_PERIOD_SECONDS,
        FUNDING_RATE_PRECISION,
    )
    .unwrap();
    assert!(rate > 0);

    let per_base = funding_delta_per_base(rate, px(100)).unwrap();
    assert!(per_base > 0);

    assert!(funding_payment(ONE_SOL, per_base, 0).unwrap() > 0); // long pays
    assert!(funding_payment(-ONE_SOL, per_base, 0).unwrap() < 0); // short receives
}
