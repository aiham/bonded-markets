use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod utils;
use {instructions::*, state::*, utils::*};

declare_id!("4NmFzm4vSA3ey45hpcQTdF16583rMaLuCrQ1LvWRKAH7");

#[program]
pub mod bonded_markets {
    use super::*;
    pub fn new_market(
        ctx: Context<NewMarket>,
        market_bump: u8,
        attribution_bump: u8,
        target_treasury_bump: u8,
        authority_bump: u8,
        name: String,
        curve: u8,
    ) -> ProgramResult {
        new_market::handler(
            ctx,
            market_bump,
            attribution_bump,
            target_treasury_bump,
            authority_bump,
            name,
            curve,
        )
    }
    pub fn buy(ctx: Context<Buy>, amount: u64) -> ProgramResult {
        buy::handler(ctx, amount)
    }

    pub fn sell(ctx: Context<Sell>, amount: u64) -> ProgramResult {
        sell::handler(ctx, amount)
    }
}
