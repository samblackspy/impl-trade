//! `cancel_order` — remove a resting order by id.

use crate::errors::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelOrder<'info> {
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
}

pub fn cancel_order(ctx: Context<CancelOrder>, order_id: u32) -> Result<()> {
    let user = &mut ctx.accounts.user;
    let slot = user
        .orders
        .iter()
        .position(|o| o.is_open() && o.order_id == order_id)
        .ok_or(ErrorCode::OrderNotFound)?;
    user.orders[slot] = Order::default();
    msg!("cancel order id={}", order_id);
    Ok(())
}
