use {
    crate::state::*,
    crate::utils::{curve_math, *},
    anchor_lang::prelude::*,
    anchor_spl::token,
};
#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    seller: Signer<'info>,
    #[account(
        mut,
        constraint = seller_base_token_account.owner == seller.key(),
        //transfer ix validates mint
    )]
    seller_base_token_account: Account<'info, token::TokenAccount>,
    #[account(mut)] //burn ix validates owner/mint
    seller_target_token_account: Account<'info, token::TokenAccount>,
    #[account(
        constraint = market.target_mint == market_target_mint.key(),
        constraint = market.authority.address == market_authority.key(),
        constraint = market.base_treasury.address == market_base_treasury.key()
    )]
    market: Account<'info, Market>,
    #[account(mut)]
    market_target_mint: Account<'info, token::Mint>,
    market_authority: AccountInfo<'info>, //verified via cpi
    #[account(mut)]
    market_base_treasury: Account<'info, token::TokenAccount>,
    token_program: Program<'info, token::Token>,
}

pub fn handler(ctx: Context<Sell>, amount: u64) -> ProgramResult {
    let market_authority_seeds = &[
        &MARKET_AUTHORITY_SEED[..],
        ctx.accounts.market.target_mint.as_ref(),
        &[ctx.accounts.market.authority.bump],
    ];

    //burn target tokens from seller's account
    token::burn(
        ctx.accounts.into_burn_seller_target_tokens_context(),
        amount,
    )?;

    //transfer base tokens from market treasury to the seller
    let total_sale_price_in_base_tokens: u64 = total_sale_price_in_base_tokens(
        ctx.accounts.market.curve,
        ctx.accounts.market_target_mint.supply,
        amount,
    );
    token::transfer(
        ctx.accounts
            .into_transfer_base_tokens_to_seller_context()
            .with_signer(&[market_authority_seeds]),
        total_sale_price_in_base_tokens,
    )?;
    Ok(())
}

pub fn total_sale_price_in_base_tokens(curve: Curve, mint_supply: u64, sale_amount: u64) -> u64 {
    let future_supply = mint_supply.checked_sub(sale_amount).unwrap();
    match curve {
        Curve::Linear => curve_math::linear::area_under_curve(future_supply, mint_supply),
        Curve::Quadratic => curve_math::quadratic::area_under_curve(future_supply, mint_supply),
    }
}

impl<'info> Sell<'info> {
    pub fn into_burn_seller_target_tokens_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, token::Burn<'info>> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = token::Burn {
            to: self.seller_target_token_account.to_account_info(),
            mint: self.market_target_mint.to_account_info(),
            authority: self.seller.to_account_info(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
    pub fn into_transfer_base_tokens_to_seller_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, token::Transfer<'info>> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = token::Transfer {
            from: self.market_base_treasury.to_account_info(),
            to: self.seller_base_token_account.to_account_info(),
            authority: self.market_authority.to_account_info(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
