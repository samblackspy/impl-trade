//! `User` — per-wallet account holding collateral, positions, and resting orders.

use crate::constants::*;
use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum PositionDirection {
    #[default]
    Long,
    Short,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum OrderType {
    #[default]
    Market,
    Limit,
    TriggerMarket,
    TriggerLimit,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum OrderStatus {
    #[default]
    Init,
    Open,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum OrderTriggerCondition {
    #[default]
    Above,
    Below,
}

/// A position in a single market. `base_asset_amount` is signed: positive = long,
/// negative = short. `quote_entry_amount` is the signed cost basis (negative when you
/// paid quote to go long, positive when you received quote to go short) so that
/// `uPnL = base_value + quote_entry_amount` — see `crate::math::pnl`.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, Default)]
pub struct PerpPosition {
    pub market_index: u16,
    pub base_asset_amount: i64,  // signed, BASE_PRECISION
    pub quote_entry_amount: i64, // signed, QUOTE_PRECISION
    pub last_cumulative_funding_rate: i128,
    pub open_orders: u8,
}

impl PerpPosition {
    pub fn is_open(&self) -> bool {
        self.base_asset_amount != 0
    }
    /// A slot is reusable when it has no position and no resting orders.
    pub fn is_available(&self) -> bool {
        self.base_asset_amount == 0 && self.open_orders == 0
    }
    pub fn direction(&self) -> PositionDirection {
        if self.base_asset_amount < 0 {
            PositionDirection::Short
        } else {
            PositionDirection::Long
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, Default)]
pub struct Order {
    pub order_id: u32,
    pub market_index: u16,
    pub order_type: OrderType,
    pub status: OrderStatus,
    pub direction: PositionDirection,
    pub base_asset_amount: u64,        // magnitude, BASE_PRECISION
    pub base_asset_amount_filled: u64, // BASE_PRECISION
    pub price: u64,                    // limit price, PRICE_PRECISION (0 for market)
    pub trigger_price: u64,            // PRICE_PRECISION
    pub trigger_condition: OrderTriggerCondition,
    pub reduce_only: bool,
    pub post_only: bool,
    pub ts: i64,
}

impl Order {
    pub fn is_open(&self) -> bool {
        self.status == OrderStatus::Open
    }
    pub fn remaining_base(&self) -> u64 {
        self.base_asset_amount
            .saturating_sub(self.base_asset_amount_filled)
    }
}

#[account]
#[derive(InitSpace, Default, Debug)]
pub struct User {
    pub authority: Pubkey,
    /// Deposited collateral, QUOTE_PRECISION (USDC, 1e6).
    pub collateral: u64,
    pub cumulative_deposits: i64,
    pub settled_pnl: i64,
    pub next_order_id: u32,
    pub being_liquidated: bool,
    pub bankrupt: bool,
    /// Unrecovered bad debt (QUOTE_PRECISION) awaiting `resolve_perp_bankruptcy`.
    pub bad_debt: u64,
    pub bump: u8,
    pub positions: [PerpPosition; MAX_POSITIONS],
    pub orders: [Order; MAX_ORDERS],
}

impl User {
    pub const SEED: &'static [u8] = b"user";

    pub fn find_position(&self, market_index: u16) -> Option<usize> {
        self.positions
            .iter()
            .position(|p| p.is_open() && p.market_index == market_index)
    }

    /// Returns the index of the existing position for `market_index`, or claims a free
    /// slot and initializes it. Errors if no slot is available.
    pub fn get_or_create_position(&mut self, market_index: u16) -> Result<usize> {
        if let Some(i) = self
            .positions
            .iter()
            .position(|p| p.market_index == market_index && !p.is_available())
        {
            return Ok(i);
        }
        let idx = self
            .positions
            .iter()
            .position(|p| p.is_available())
            .ok_or(ErrorCode::MaxPositionsReached)?;
        self.positions[idx] = PerpPosition {
            market_index,
            ..Default::default()
        };
        Ok(idx)
    }

    pub fn next_order_id(&mut self) -> u32 {
        let id = self.next_order_id;
        self.next_order_id = self.next_order_id.wrapping_add(1);
        id
    }
}
