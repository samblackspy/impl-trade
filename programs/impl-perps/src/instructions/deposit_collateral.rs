//! `deposit_collateral` — pull USDC from the user's token account into the collateral vault.

use crate::errors::ErrorCode;
use crate::math::safe::SafeMath;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Account<'info, State>,

    #[account(
        mut,
        seeds = [User::SEED, authority.key().as_ref()],
        bump = user.bump,
        has_one = authority
    )]
    pub user: Box<Account<'info, User>>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = user_token_account.mint == state.collateral_mint @ ErrorCode::InvalidAmount,
        constraint = user_token_account.owner == authority.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = state.collateral_vault)]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.state.paused, ErrorCode::ProtocolPaused);
    require!(amount > 0, ErrorCode::InvalidAmount);

    // EFFECT: credit the user's collateral first.
    let user = &mut ctx.accounts.user;
    user.collateral = user.collateral.safe_add(amount)?;
    user.cumulative_deposits = user.cumulative_deposits.safe_add(amount as i64)?;

    // INTERACTION: move tokens in (reverts everything on failure).
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.collateral_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
    )?;

    msg!("deposit: {}", amount);
    Ok(())
}
