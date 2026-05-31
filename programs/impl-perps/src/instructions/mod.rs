//! Instruction handlers, one file per instruction. Each module exports its `Accounts`
//! context (+ params struct) and a `handler` fn; `lib.rs` wires them into `#[program]`.

pub mod cancel_order;
pub mod close_position;
pub mod deposit_collateral;
pub mod fill_perp_match;
pub mod fill_perp_order;
pub mod initialize_market;
pub mod initialize_mock_oracle;
pub mod initialize_state;
pub mod initialize_user;
pub mod liquidate_perp;
pub mod open_position;
pub mod place_perp_order;
pub mod resolve_perp_bankruptcy;
pub mod set_protocol_paused;
pub mod settle_funding;
pub mod trigger_order;
pub mod update_funding_rate;
pub mod update_market_params;
pub mod update_mock_oracle;
pub mod withdraw_collateral;

// Glob re-export so Anchor's generated `__client_accounts_*` modules surface at the
// crate root (the `#[program]` macro resolves them via `crate::`). Handlers are named
// uniquely per instruction, so the globs don't collide.
pub use cancel_order::*;
pub use close_position::*;
pub use deposit_collateral::*;
pub use fill_perp_match::*;
pub use fill_perp_order::*;
pub use initialize_market::*;
pub use initialize_mock_oracle::*;
pub use initialize_state::*;
pub use initialize_user::*;
pub use liquidate_perp::*;
pub use open_position::*;
pub use place_perp_order::*;
pub use resolve_perp_bankruptcy::*;
pub use set_protocol_paused::*;
pub use settle_funding::*;
pub use trigger_order::*;
pub use update_funding_rate::*;
pub use update_market_params::*;
pub use update_mock_oracle::*;
pub use withdraw_collateral::*;
