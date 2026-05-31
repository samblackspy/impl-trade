//! `initialize_user` — create the caller's `User` account (collateral + positions).

use crate::errors::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(mut, seeds = [State::SEED], bump = state.bump)]
    pub state: Account<'info, State>,

    #[account(
        init,
        payer = authority,
        space = 8 + User::INIT_SPACE,
        seeds = [User::SEED, authority.key().as_ref()],
        bump
    )]
    pub user: Box<Account<'info, User>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
    let user = &mut ctx.accounts.user;
    user.authority = ctx.accounts.authority.key();
    user.bump = ctx.bumps.user;
    user.next_order_id = 0;

    ctx.accounts.state.num_users = ctx
        .accounts
        .state
        .num_users
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    Ok(())
}
