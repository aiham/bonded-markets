use {crate::state::*, crate::utils::*, anchor_lang::prelude::*, anchor_spl::token};

/*
why this imp?

- easy to see exactly how much burned directly from the burn pool, rather than from other sources
- keeps the supply on the mint in line with the actual supply eligible to be circulated

*/

#[derive(Accounts)]
pub struct SponsoredBurn<'info> {
    sponsor: Signer<'info>,
    #[account(mut)]
    target_token_account: Account<'info, token::TokenAccount>, //authority, mint, owner checked via cpi into burn ix
    #[account(mut)]
    target_mint: Account<'info, token::Mint>,
    #[account(
        mut,
        constraint = market.target_mint == target_mint.key()
    )]
    market: Account<'info, Market>,
    token_program: Program<'info, token::Token>,
}

pub fn handler(ctx: Context<SponsoredBurn>, amount: u64) -> ProgramResult {
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
