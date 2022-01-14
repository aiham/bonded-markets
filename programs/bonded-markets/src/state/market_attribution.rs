use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct MarketAttribution {
    target_mint: Pubkey,
}
