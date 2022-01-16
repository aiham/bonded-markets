use anchor_lang::prelude::*;
use anchor_spl::token;
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

    pub fn sponsored_burn(ctx: Context<SponsoredBurn>, amount: u64) -> ProgramResult {
        //so i am going to put them in a burn pool that way i don't have to change the sell equation
        //or u could just actually burn them but make the supply burned + outstanding
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.target_mint.to_account_info(),
                    to: ctx.accounts.target_token_account.to_account_info(),
                    authority: ctx.accounts.sponsor.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.market.amount_burned = ctx
            .accounts
            .market
            .amount_burned
            .checked_add(amount)
            .unwrap();

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SponsoredBurn<'info> {
    sponsor: Signer<'info>,
    #[account(mut)]
    target_token_account: Account<'info, token::TokenAccount>,
    #[account(mut)]
    target_mint: Account<'info, token::Mint>,
    #[account(mut)]
    market: Account<'info, Market>,
    token_program: Program<'info, token::Token>,
    //so what this is going to do is take the amount passed in and burn it, then increment the value of total burned in the market
}

// impl<'info> SponsoredBurn<'info> {

// }
