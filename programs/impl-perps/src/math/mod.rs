//! Pure, testable math — the auditable core of the protocol. Split one concern per file.
//!
//! Conventions:
//! - All arithmetic goes through `SafeMath` (`safe.rs`); no raw `+ - * /` on money.
//! - Rounding is documented at each value-moving step and always favors the protocol.
//! - Functions are pure (no account I/O) so they can be unit-tested directly.

pub mod amm;
pub mod funding;
pub mod liquidation;
pub mod margin;
pub mod pnl;
pub mod safe;

pub use amm::*;
pub use funding::*;
pub use liquidation::*;
pub use margin::*;
pub use pnl::*;
pub use safe::*;

#[cfg(test)]
mod tests;
