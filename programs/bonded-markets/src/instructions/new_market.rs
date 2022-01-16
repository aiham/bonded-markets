use {crate::state::*, crate::utils::*, anchor_lang::prelude::*, anchor_spl::token};

#[derive(Accounts)]
#[instruction(market_bump: u8, attribution_bump: u8, base_treasury_bump: u8, market_authority_bump: u8, name: String)]
pub struct NewMarket<'info> {
    payer: Signer<'info>,
    creator: Signer<'info>,
    #[account(
        init,
        seeds = [MARKET_SEED, target_mint.key().as_ref()],
        bump = market_bump,
        payer = payer,
        space = 204,
    )]
    market: Account<'info, Market>,
    #[account(
        init,
        seeds = [MARKET_ATTRIBUTION_SEED, name.clone().to_seed_format().as_bytes()],
        bump = attribution_bump,
        payer = payer,
    )]
    attribution: Account<'info, MarketAttribution>,
    //#[account(address = moonbase token)]
    base_mint: Account<'info, token::Mint>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = authority,
    )]
    target_mint: Box<Account<'info, token::Mint>>,
    #[account(
       init,
        seeds = [BASE_TREASURY_SEED, target_mint.key().as_ref()],
        bump = base_treasury_bump,
        payer = payer,
        token::authority = authority,
        token::mint = base_mint,
    )]
    base_treasury: Box<Account<'info, token::TokenAccount>>,
    #[account(
        seeds = [MARKET_AUTHORITY_SEED, target_mint.key().as_ref()],
        bump = market_authority_bump,
    )]
    authority: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    token_program: Program<'info, token::Token>,
    system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<NewMarket>,
    market_bump: u8,
    _attribution_bump: u8,
    base_treasury_bump: u8,
    authority_bump: u8,
    name: String,
    curve: u8,
) -> ProgramResult {
    ctx.accounts.market.name = name;
    ctx.accounts.market.creator = ctx.accounts.creator.key();
    ctx.accounts.market.base_mint = ctx.accounts.base_mint.key();
    ctx.accounts.market.target_mint = ctx.accounts.target_mint.key();
    ctx.accounts.market.base_treasury = Pda {
        address: ctx.accounts.base_treasury.key(),
        bump: base_treasury_bump,
    };
    ctx.accounts.market.authority = Pda {
        address: ctx.accounts.authority.key(),
        bump: authority_bump,
    };
    ctx.accounts.market.curve = Curve::from(curve).unwrap();
    ctx.accounts.market.bump = market_bump;

    Ok(())
}
