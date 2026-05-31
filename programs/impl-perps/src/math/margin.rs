//! Margin math — collateral, margin requirements, and account health.
//!
//! `total_collateral = deposits + Σ unrealized_pnl`. A position contributes an
//! initial-margin requirement (gates opening / withdrawing) and a maintenance-margin
//! requirement (gates liquidation). Free collateral = total_collateral − Σ IMR.

use crate::constants::*;
use crate::errors::ErrorCode;
use crate::math::pnl::unrealized_pnl;
use crate::math::safe::{div_ceil, SafeMath};
use crate::state::PerpPosition;
use anchor_lang::prelude::*;

/// Notional value of a position (QUOTE_PRECISION) = |base| * price / BASE_PRECISION.
pub fn position_notional(base_asset_amount: i64, oracle_price: u64) -> Result<u128> {
    (base_asset_amount.unsigned_abs() as u128)
        .safe_mul(oracle_price as u128)?
        .safe_div(BASE_PRECISION)
}

/// Margin requirement = notional * margin_ratio / MARGIN_PRECISION.
pub fn margin_requirement(notional: u128, margin_ratio: u32) -> Result<u128> {
    notional
        .safe_mul(margin_ratio as u128)?
        .safe_div(MARGIN_PRECISION)
}

/// Taker/maker fee on a notional (QUOTE_PRECISION), rounded **up** (protocol collects more).
pub fn fee_amount(notional: u128, fee_bps: u16) -> Result<u128> {
    div_ceil(notional.safe_mul(fee_bps as u128)?, BPS_DENOMINATOR)
}

/// Accumulates account health across one or more positions. Build it from the user's
/// collateral, then `add_position` for each open position with that market's oracle price
/// and margin ratios.
#[derive(Clone, Copy, Debug)]
pub struct MarginCalculation {
    pub total_collateral: i128,
    pub initial_margin_requirement: u128,
    pub maintenance_margin_requirement: u128,
}

impl MarginCalculation {
    pub fn new(collateral: u64) -> Self {
        Self {
            total_collateral: collateral as i128,
            initial_margin_requirement: 0,
            maintenance_margin_requirement: 0,
        }
    }

    pub fn add_position(
        &mut self,
        position: &PerpPosition,
        oracle_price: u64,
        margin_ratio_initial: u32,
        margin_ratio_maintenance: u32,
    ) -> Result<()> {
        self.total_collateral = self
            .total_collateral
            .safe_add(unrealized_pnl(position, oracle_price)?)?;

        let notional = position_notional(position.base_asset_amount, oracle_price)?;
        self.initial_margin_requirement = self
            .initial_margin_requirement
            .safe_add(margin_requirement(notional, margin_ratio_initial)?)?;
        self.maintenance_margin_requirement = self
            .maintenance_margin_requirement
            .safe_add(margin_requirement(notional, margin_ratio_maintenance)?)?;
        Ok(())
    }

    /// Collateral free to back new risk or be withdrawn (can be negative).
    pub fn free_collateral(&self) -> Result<i128> {
        self.total_collateral
            .safe_sub(self.initial_margin_requirement as i128)
    }

    pub fn meets_initial(&self) -> bool {
        self.total_collateral >= self.initial_margin_requirement as i128
    }

    pub fn meets_maintenance(&self) -> bool {
        self.total_collateral >= self.maintenance_margin_requirement as i128
    }

    /// Enforce that the account is at or above initial margin (after opening / withdrawing).
    pub fn require_initial(&self) -> Result<()> {
        require!(self.meets_initial(), ErrorCode::InsufficientFreeCollateral);
        Ok(())
    }
}
