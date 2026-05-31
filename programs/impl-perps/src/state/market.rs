//! `Market` — one perpetual market, including its virtual AMM (`Amm`).

use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

/// Where a market sources its index price.
#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum OracleSource {
    /// Pyth pull-oracle `PriceUpdateV2` (devnet/mainnet). The default and the only
    /// source with real cryptographic provenance.
    #[default]
    Pyth,
    /// Program-owned `MockOracle`, price pushed by an authority. **Local/dev only** — see
    /// `crate::state::mock_oracle`. Never valid on mainnet.
    Mock,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum MarketStatus {
    /// Created but not yet open for trading.
    #[default]
    Initialized,
    /// Fully tradeable.
    Active,
    /// Only position-reducing actions allowed.
    ReduceOnly,
    /// All trading halted.
    Paused,
}

/// Virtual AMM. Reserves are *virtual* (no tokens held) and in `AMM_RESERVE_PRECISION`.
/// Mark price = quote_asset_reserve * peg_multiplier / base_asset_reserve (PRICE_PRECISION).
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, Default)]
pub struct Amm {
    pub base_asset_reserve: u128,
    pub quote_asset_reserve: u128,
    pub sqrt_k: u128,
    pub peg_multiplier: u128,
    /// Net base held by longs / shorts via the AMM (for skew + funding).
    pub base_asset_amount_long: i128,
    pub base_asset_amount_short: i128,
    /// Cumulative funding (per base unit) paid by longs / shorts.
    pub cumulative_funding_rate_long: i128,
    pub cumulative_funding_rate_short: i128,
    pub last_funding_rate: i128,
    pub last_funding_ts: i64,
    /// TWAP accumulators (PRICE_PRECISION).
    pub last_mark_price_twap: u64,
    pub last_oracle_price_twap: u64,
    pub last_twap_ts: i64,
    /// Lifetime fees collected by the AMM (QUOTE_PRECISION).
    pub total_fee: i128,
}

#[account]
#[derive(InitSpace, Default, Debug)]
pub struct Market {
    pub market_index: u16,
    pub status: MarketStatus,
    /// Price account: a Pyth `PriceUpdateV2` (Pyth source) or a `MockOracle` (Mock source).
    pub oracle: Pubkey,
    /// How to interpret `oracle`. Defaults to Pyth.
    pub oracle_source: OracleSource,
    /// Expected Pyth feed id — verified against the price-update account on read (Pyth source).
    pub feed_id: [u8; 32],
    pub amm: Amm,
    /// Initial / maintenance margin ratios, in `MARGIN_PRECISION` (1e4).
    pub margin_ratio_initial: u32,
    pub margin_ratio_maintenance: u32,
    /// Convenience cap (margin ratios are the real constraint).
    pub max_leverage: u32,
    /// Minimum order size in base (BASE_PRECISION).
    pub min_order_base: u64,
    pub open_interest_long: u128,
    pub open_interest_short: u128,
    pub max_open_interest: u128,
    pub next_funding_ts: i64,
    pub funding_period: i64,
    pub liquidation_fee_bps: u16,
    /// Display name, e.g. "SOL-PERP" (null-padded).
    pub name: [u8; 16],
    pub bump: u8,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";

    pub fn name_str(&self) -> String {
        String::from_utf8_lossy(&self.name)
            .trim_end_matches('\0')
            .to_string()
    }

    pub fn is_active(&self) -> bool {
        self.status == MarketStatus::Active
    }

    pub fn allows_reduce_only(&self) -> bool {
        matches!(self.status, MarketStatus::Active | MarketStatus::ReduceOnly)
    }

    pub fn require_can_reduce(&self) -> Result<()> {
        require!(self.allows_reduce_only(), ErrorCode::MarketNotActive);
        Ok(())
    }

    /// Only Active markets allow opening/increasing exposure.
    pub fn require_can_open(&self) -> Result<()> {
        require!(
            self.status == MarketStatus::Active,
            ErrorCode::MarketNotActive
        );
        Ok(())
    }

    /// Order placement follows the same circuit-breaker semantics as fills:
    /// Active markets accept all order intents, ReduceOnly markets accept only
    /// reduce-only close intents, and Paused/Initialized markets accept none.
    pub fn require_can_place_order(&self, reduce_only: bool) -> Result<()> {
        if reduce_only {
            self.require_can_reduce()
        } else {
            self.require_can_open()
        }
    }
}
