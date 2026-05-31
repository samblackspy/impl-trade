//! `resolve_perp_bankruptcy` — cover a bankrupt account's recorded bad debt from the
//! insurance fund. If the fund can't cover it all, the remainder would be socialized via
//! ADL (deferred); the account stays flagged until fully covered.

use crate::errors::ErrorCode;
use crate::math::safe::SafeMath;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResolvePerpBankruptcy<'info> {
    #[account(seeds = [State::SEED], bump = state.bump)]
    pub state: Box<Account<'info, State>>,

    /// Permissionless crank (keeper).
    pub keeper: Signer<'info>,

    #[account(mut)]
    pub user: Box<Account<'info, User>>,

    #[account(mut, seeds = [InsuranceFund::SEED], bump = insurance_fund.bump)]
    pub insurance_fund: Box<Account<'info, InsuranceFund>>,
}

pub fn resolve_perp_bankruptcy(ctx: Context<ResolvePerpBankruptcy>) -> Result<()> {
    let user = &mut ctx.accounts.user;
    require!(
        user.bankrupt && user.bad_debt > 0,
        ErrorCode::NotLiquidatable
    );

    let fund = &mut ctx.accounts.insurance_fund;
    let draw = user.bad_debt.min(fund.total_deposits);
    fund.total_deposits = fund.total_deposits.safe_sub(draw)?;
    user.bad_debt = user.bad_debt.safe_sub(draw)?;

    if user.bad_debt == 0 {
        user.bankrupt = false;
        msg!("bankruptcy resolved: drew {} from insurance", draw);
    } else {
        // Insurance exhausted; the remainder needs ADL / socialized loss (deferred).
        msg!(
            "bankruptcy partial: drew {}, remaining bad debt {}",
            draw,
            user.bad_debt
        );
    }
    Ok(())
}
