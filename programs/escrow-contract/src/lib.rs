use anchor_lang::prelude::*;
use anchor_lang::system_program;

use state::*;

declare_id!("AwnxJQFBodBZBL4XtuuCUmAkRSUrdNN1Q9Vw5cM4D78");
mod state;
mod error;

/*
Step 1: Payer initializes and deposits SOL,
Payer can withdraw during this step ^^,
Step 2: Receiver confirms services completed,
Step 3: Payer confirms services completed, and the lamports are transferred
*/


#[program]
pub mod escrow_contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, amount: u64) -> Result<()> {
        let cpi = CpiContext::new(ctx.accounts.system_program.to_account_info(), system_program::Transfer {
            from: ctx.accounts.payer.to_account_info(),
            to: ctx.accounts.holding_account.to_account_info()
        });
        system_program::transfer(cpi, amount)?;
        let hold_acct = &mut ctx.accounts.holding_account;
        hold_acct.state = 1;
        Ok(())
    }

    pub fn payer_cancel(ctx: Context<PayerCancel>, _nonce: u8) -> Result<()> {
        let holding_account = &ctx.accounts.holding_account;
        match holding_account.state {
            0 => {
                return Err(error::EscrowError::AccountNotInitialized.into())
            },
            1 => {
                return Ok(())
            },
            2 => {
                return Err(error::EscrowError::ReceiverAlreadyConfirmed.into())
            },
            _ => {
                return Err(ProgramError::InvalidAccountData.into())
            }
        }
        
    }

    pub fn receiver_confirm(ctx: Context<ReceiverConfirm>, _nonce: u8) -> Result<()> {
        let holding_account = &mut ctx.accounts.holding_account;
        match holding_account.state {
            0 => {
                return Err(error::EscrowError::AccountNotInitialized.into())
            },
            1 => {
                holding_account.state = 2;
                return Ok(())
            },
            2 => {
                return Err(error::EscrowError::AwaitingPayerConfirmation.into())
            },
            _ => {
                return Err(ProgramError::InvalidAccountData.into())
            }
        }
        
    }

    pub fn payer_confirm(ctx: Context<PayerConfirm>, _nonce: u8) -> Result<()> {
        let holding_account = &ctx.accounts.holding_account;
        if holding_account.state == 2 {
            return Ok(())
        }
        Err(error::EscrowError::ReceiverNotYetConfirmed.into())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(init, payer = payer, space = 8 + 8, seeds = [receiver.key.as_ref(), payer.key.as_ref()], bump)]
    pub holding_account: Box<Account<'info, EscrowAccount>>,

    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct PayerCancel<'info> {
    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, close = payer, seeds = [receiver.key.as_ref(), payer.key.as_ref()], bump = nonce)]
    pub holding_account: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct ReceiverConfirm<'info> {
    #[account(mut)]
    pub receiver: Signer<'info>,

    #[account(mut)]
    pub payer: SystemAccount<'info>,

    #[account(mut, seeds = [receiver.key.as_ref(), payer.key.as_ref()], bump = nonce)]
    pub holding_account: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct PayerConfirm<'info> {
    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, close = receiver, seeds = [receiver.key.as_ref(), payer.key.as_ref()], bump = nonce)]
    pub holding_account: Account<'info, EscrowAccount>,
}