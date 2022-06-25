use anchor_lang::prelude::*;

#[account]
pub struct EscrowAccount {
  pub state: u8
}

/*
state = 1 : deposited, can cancel at this point
state = 2 : receiver confirmed,
*/