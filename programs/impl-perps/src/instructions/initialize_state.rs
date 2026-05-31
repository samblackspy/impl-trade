//! `initialize_state` — one-time global setup: the `State` singleton, the PDA-owned
//! collateral + insurance vaults, and the `InsuranceFund` account.

use crate::constants::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeStateParams {
    pub taker_fee_bps: u16,
    pub maker_rebate_bps: u16,
    pub liquidation_fee_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeState<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + State::INIT_SPACE,
        seeds = [State::SEED],
        bump
    )]
    pub state: Account<'info, State>,

    /// CHECK: PDA used only as the vault authority (signer); never deserialized.
    #[account(seeds = [State::VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [State::COLLATERAL_VAULT_SEED],
        bump,
        token::mint = collateral_mint,
        token::authority = vault_authority,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        seeds = [State::INSURANCE_VAULT_SEED],
        bump,
        token::mint = collateral_mint,
        token::authority = vault_authority,
    )]
    pub insurance_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        space = 8 + InsuranceFund::INIT_SPACE,
        seeds = [InsuranceFund::SEED],
        bump
    )]
    pub insurance_fund: Account<'info, InsuranceFund>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn initialize_state(
    ctx: Context<InitializeState>,
    params: InitializeStateParams,
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    state.admin = ctx.accounts.admin.key();
    state.collateral_mint = ctx.accounts.collateral_mint.key();
    state.collateral_vault = ctx.accounts.collateral_vault.key();
    state.insurance_fund_vault = ctx.accounts.insurance_vault.key();
    state.num_markets = 0;
    state.num_users = 0;
    state.taker_fee_bps = params.taker_fee_bps;
    state.maker_rebate_bps = params.maker_rebate_bps;
    state.liquidation_fee_bps = params.liquidation_fee_bps;
    state.max_oracle_staleness_seconds = DEFAULT_MAX_ORACLE_STALENESS_SECONDS;
    state.max_oracle_confidence_bps = DEFAULT_MAX_ORACLE_CONFIDENCE_BPS;
    state.paused = false;
    state.vault_authority_bump = ctx.bumps.vault_authority;
    state.bump = ctx.bumps.state;

    ctx.accounts.insurance_fund.bump = ctx.bumps.insurance_fund;

    msg!("impl.trade state initialized");
    Ok(())
}
