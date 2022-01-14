use {
    crate::state::*,
    crate::utils::{curve_math, *},
    anchor_lang::prelude::*,
    anchor_spl::{associated_token, token},
};

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    buyer: Signer<'info>,
    #[account(mut)]
    buyer_base_token_account: Account<'info, token::TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::authority = buyer,
        associated_token::mint = market_target_mint,
        constraint = buyer_target_token_account.owner == buyer.key(),
    )]
    buyer_target_token_account: Account<'info, token::TokenAccount>,
    #[account(
        constraint = market.target_mint == market_target_mint.key(),
        constraint = market.authority.address == market_authority.key(),
        constraint = market.base_treasury.address == market_base_treasury.key(),
    )]
    market: Box<Account<'info, Market>>,
    market_authority: AccountInfo<'info>,
    #[account(mut)]
    market_target_mint: Account<'info, token::Mint>,
    #[account(mut)]
    market_base_treasury: Box<Account<'info, token::TokenAccount>>,
    rent: Sysvar<'info, Rent>,
    associated_token_program: Program<'info, associated_token::AssociatedToken>,
    token_program: Program<'info, token::Token>,
    system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Buy>, amount: u64) -> ProgramResult {
    let market_authority_seeds = &[
        &MARKET_AUTHORITY_SEED[..],
        ctx.accounts.market.target_mint.as_ref(),
        &[ctx.accounts.market.authority.bump],
    ];

    //receive base tokens from buyer into market treasury
    let total_purchase_price_in_base_tokens: u64 = total_purchase_price_in_base_tokens(
        ctx.accounts.market.curve,
        ctx.accounts.market_target_mint.supply,
        amount,
    );
    token::transfer(
        ctx.accounts.into_receive_base_tokens_from_buyer_context(),
        total_purchase_price_in_base_tokens,
    )?;

    //mint target tokens to buyer
    token::mint_to(
        ctx.accounts
            .into_mint_target_tokens_to_buyer_context()
            .with_signer(&[market_authority_seeds]),
        amount.clone(),
    )?;

    Ok(())
}

impl<'info> Buy<'info> {
    pub fn into_mint_target_tokens_to_buyer_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, token::MintTo<'info>> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = token::MintTo {
            mint: self.market_target_mint.to_account_info(),
            to: self.buyer_target_token_account.to_account_info(),
            authority: self.market_authority.to_account_info(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
    pub fn into_receive_base_tokens_from_buyer_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, token::Transfer<'info>> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = token::Transfer {
            from: self.buyer_base_token_account.to_account_info(),
            to: self.market_base_treasury.to_account_info(),
            authority: self.buyer.to_account_info(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

pub fn total_purchase_price_in_base_tokens(
    curve: Curve,
    mint_supply: u64,
    purchase_amount: u64,
) -> u64 {
    let future_supply = mint_supply.checked_add(purchase_amount).unwrap();
    match curve {
        Curve::Linear => curve_math::linear::area_under_curve(mint_supply, future_supply),
        Curve::Quadratic => curve_math::quadratic::area_under_curve(mint_supply, future_supply),
    }
}
