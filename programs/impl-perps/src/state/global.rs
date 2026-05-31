//! `State` — the singleton global config + protocol authority.

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default, Debug)]
pub struct State {
    /// Admin authority (Squads multisig in production).
    pub admin: Pubkey,
    /// The single collateral asset (development USDC for capstone/devnet evaluation).
    pub collateral_mint: Pubkey,
    /// PDA token account holding all user collateral.
    pub collateral_vault: Pubkey,
    /// PDA token account backing the insurance fund.
    pub insurance_fund_vault: Pubkey,
    pub num_markets: u16,
    pub num_users: u32,
    /// Fees, in basis points.
    pub taker_fee_bps: u16,
    pub maker_rebate_bps: u16,
    pub liquidation_fee_bps: u16,
    /// Oracle guard rails.
    pub max_oracle_staleness_seconds: u64,
    pub max_oracle_confidence_bps: u64,
    /// Emergency pause — blocks all user-facing position changes when true.
    pub paused: bool,
    /// Bump for the shared vault authority PDA (signs vault transfers out).
    pub vault_authority_bump: u8,
    pub bump: u8,
}

impl State {
    pub const SEED: &'static [u8] = b"state";
    /// PDA that owns the collateral + insurance vaults (the only signer for payouts).
    pub const VAULT_AUTHORITY_SEED: &'static [u8] = b"vault_authority";
    pub const COLLATERAL_VAULT_SEED: &'static [u8] = b"collateral_vault";
    pub const INSURANCE_VAULT_SEED: &'static [u8] = b"insurance_vault";
}
