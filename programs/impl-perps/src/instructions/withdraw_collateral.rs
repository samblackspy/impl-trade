//! `withdraw_collateral` — pay USDC out of the vault, but only if the account still meets
//! initial margin afterward. The vault authority PDA signs the transfer.

use crate::errors::ErrorCode;
use crate::math::margin::MarginCalculation;
use crate::math::safe::SafeMath;
use crate::oracle::load_oracle_price;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    #[account(
        mut,
        seeds = [User::SEED, authority.key().as_ref()],
        bump = user.bump,
        has_one = authority
    )]
    pub user: Box<Account<'info, User>>,

    pub authority: Signer<'info>,

    #[account(
        seeds = [Market::SEED, market.market_index.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,

    /// CHECK: key constrained to `market.oracle`; deserialized + owner-checked by
    /// `load_oracle_price` according to `market.oracle_source`.
    #[account(address = market.oracle @ ErrorCode::InvalidOracleFeed)]
    pub price_update: UncheckedAccount<'info>,

    #[account(mut, address = state.collateral_vault)]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: vault authority PDA; only signs the payout.
    #[account(seeds = [State::VAULT_AUTHORITY_SEED], bump = state.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = user_token_account.owner == authority.key() @ ErrorCode::Unauthorized)]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    let state = &ctx.accounts.state;
    require!(!state.paused, ErrorCode::ProtocolPaused);
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        amount <= ctx.accounts.user.collateral,
        ErrorCode::InsufficientCollateral
    );

    // CHECK: still solvent at initial margin after the withdrawal.
    let market = &ctx.accounts.market;
    let oracle = load_oracle_price(
        market.oracle_source,
        &ctx.accounts.price_update.to_account_info(),
        &market.feed_id,
        state.max_oracle_staleness_seconds,
        state.max_oracle_confidence_bps,
        &Clock::get()?,
    )?;
    let remaining = ctx.accounts.user.collateral.safe_sub(amount)?;
    let mut margin = MarginCalculation::new(remaining);
    if let Some(i) = ctx.accounts.user.find_position(market.market_index) {
        margin.add_position(
            &ctx.accounts.user.positions[i],
            oracle.price,
            market.margin_ratio_initial,
            market.margin_ratio_maintenance,
        )?;
    }
    margin.require_initial()?;

    // EFFECT
    ctx.accounts.user.collateral = remaining;

    // INTERACTION: vault -> user, signed by the vault authority PDA.
    let bump = state.vault_authority_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[State::VAULT_AUTHORITY_SEED, &[bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!("withdraw: {}", amount);
    Ok(())
}
