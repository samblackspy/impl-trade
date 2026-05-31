//! Program error codes.

use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Market is not in an active/tradeable status")]
    MarketNotActive,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Insufficient free collateral for this action")]
    InsufficientFreeCollateral,
    #[msg("Invalid market index")]
    InvalidMarketIndex,
    #[msg("Oracle price is stale")]
    StaleOracle,
    #[msg("Oracle confidence interval is too wide")]
    OracleConfidenceTooWide,
    #[msg("Oracle price is invalid (non-positive)")]
    InvalidOraclePrice,
    #[msg("Oracle feed id does not match the market")]
    InvalidOracleFeed,
    #[msg("Position not found")]
    PositionNotFound,
    #[msg("No available position slot")]
    MaxPositionsReached,
    #[msg("Position is still open")]
    PositionStillOpen,
    #[msg("Slippage limit exceeded")]
    SlippageExceeded,
    #[msg("Order size is below the market minimum")]
    OrderTooSmall,
    #[msg("Maximum leverage exceeded")]
    MaxLeverageExceeded,
    #[msg("Open interest cap exceeded")]
    MaxOpenInterestExceeded,
    #[msg("Position is not liquidatable")]
    NotLiquidatable,
    #[msg("Account is currently being liquidated")]
    BeingLiquidated,
    #[msg("Reduce-only order would increase the position")]
    ReduceOnlyViolation,
    #[msg("No available order slot")]
    OrdersFull,
    #[msg("Order not found")]
    OrderNotFound,
    #[msg("Unsupported order type for this action")]
    UnsupportedOrderType,
    #[msg("Trigger condition is not yet met")]
    TriggerConditionNotMet,
    #[msg("Orders do not cross (same side, or prices don't overlap)")]
    OrdersDoNotCross,
    #[msg("Cannot match an account against itself")]
    SelfMatch,
}
