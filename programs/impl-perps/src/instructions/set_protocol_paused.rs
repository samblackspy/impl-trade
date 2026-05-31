//! `set_protocol_paused` — global circuit breaker. When paused, all user-facing position
//! changes (deposit/open/withdraw/place) are blocked; risk-reducing actions (close,
//! liquidate) remain available so positions can always be wound down. Admin only.

use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetProtocolPaused<'info> {
    #[account(mut, seeds = [State::SEED], bump = state.bump, has_one = admin)]
    pub state: Box<Account<'info, State>>,

    pub admin: Signer<'info>,
}

pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
    ctx.accounts.state.paused = paused;
    msg!("protocol paused = {}", paused);
    Ok(())
}
