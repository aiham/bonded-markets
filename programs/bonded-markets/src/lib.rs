use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};

pub mod utils;
use std::convert::TryFrom;
use utils::*;

declare_id!("4NmFzm4vSA3ey45hpcQTdF16583rMaLuCrQ1LvWRKAH7");

const MARKET_AUTHORITY_SEED: &[u8] = b"market_auth";
const BASE_TREASURY_SEED: &[u8] = b"treasury";
const MARKET_SEED: &[u8] = b"market";
const MARKET_ATTRIBUTION_SEED: &[u8] = b"attribution";

#[program]
pub mod bonded_markets {
    use super::*;
    pub fn new_market(
        ctx: Context<NewMarket>,
        market_bump: u8,
        _attribution_bump: u8,
        target_treasury_bump: u8,
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
            bump: target_treasury_bump,
        };
        ctx.accounts.market.authority = Pda {
            address: ctx.accounts.authority.key(),
            bump: authority_bump,
        };
        ctx.accounts.market.curve = curve;
        ctx.accounts.market.bump = market_bump;

        if curve > 0 {
            //num curve options is only 1
            return Err(ErrorCode::CurveDoesNotExist.into());
        }
        Ok(())
    }
    pub fn buy(ctx: Context<Buy>, amount: u64) -> ProgramResult {
        //transfer tokens from buyer to treasury
        let total_cost_in_base_tokens: u64 = total_cost_in_base_tokens(
            ctx.accounts.market.curve,
            ctx.accounts.market_target_mint.supply,
            amount,
        );
        msg!("total cost in base tokens {}", total_cost_in_base_tokens);

        let market_authority_seeds = &[
            &MARKET_AUTHORITY_SEED[..],
            ctx.accounts.market.target_mint.as_ref(),
            &[ctx.accounts.market.authority.bump],
        ];

        //receive base tokens from buyer into market treasury
        token::transfer(
            ctx.accounts.into_receive_base_tokens_from_buyer_context(),
            total_cost_in_base_tokens,
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
}

//x = supply, y = price
pub fn total_cost_in_base_tokens(curve: u8, mint_supply: u64, purchase_amount: u64) -> u64 {
    let future_supply = mint_supply.checked_add(purchase_amount).unwrap();
    match curve {
        0 => one_area_under_curve(mint_supply, future_supply),
        _ => 0,
    }
}

//linear curve
pub fn one_area_under_curve(a: u64, b: u64) -> u64 {
    let mut area = one_integration_from_zero(b as u128)
        .checked_sub(one_integration_from_zero(a as u128))
        .unwrap();
    area = area.checked_div(10000000).unwrap();
    u64::try_from(area).unwrap()
}
pub fn one_integration_from_zero(x: u128) -> u128 {
    let square = x.checked_pow(2).unwrap();
    square.checked_div(2).unwrap()
}

#[derive(Accounts)]
#[instruction(market_bump: u8, attribution_bump: u8, target_treasury_bump: u8, market_authority_bump: u8, name: String)]
pub struct NewMarket<'info> {
    payer: Signer<'info>,
    creator: Signer<'info>,
    #[account(
        init,
        seeds = [MARKET_SEED, target_mint.key().as_ref()],
        bump = market_bump,
        payer = payer,
        space = 196,
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
        mint::decimals = 4,
        mint::authority = authority,
    )]
    target_mint: Box<Account<'info, token::Mint>>,
    #[account(
        init,
        seeds = [BASE_TREASURY_SEED, base_mint.key().as_ref()],
        bump = target_treasury_bump,
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

#[derive(Accounts)]
pub struct Buy<'info> {
    buyer: Signer<'info>,
    #[account(
        mut,
        constraint = buyer_base_token_account.owner == buyer.key(),
        constraint = buyer_base_token_account.mint == market.base_mint,
    )]
    buyer_base_token_account: Account<'info, token::TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::authority = buyer,
        associated_token::mint = market_target_mint,
        constraint = buyer_target_token_account.owner == buyer.key(),
        constraint = buyer_target_token_account.mint == market.target_mint,
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

#[derive(Accounts)]
pub struct Sell<'info> {
    seller: Signer<'info>,
    seller_base_token_account: Account<'info, token::TokenAccount>,
    seller_target_token_account: Account<'info, token::TokenAccount>,
    market: Account<'info, Market>,
    market_authority: AccountInfo<'info>,
    market_base_treasury: Account<'info, token::TokenAccount>,
}

#[account]
#[derive(Default)]
pub struct Market {
    name: String,
    creator: Pubkey, //wallet of creator
    base_mint: Pubkey,
    target_mint: Pubkey,
    base_treasury: Pda, //derivable as pda
    authority: Pda,     //derivable as pda -- can mint new tokens and transer out of treasury
    curve: u8,
    bump: u8, //this is assuming base is sol
}
//size (173) + 3 + string bytes (20 char)

#[account]
#[derive(Default)]
pub struct MarketAttribution {
    target_mint: Pubkey,
}

#[derive(Copy, Clone, Default, AnchorSerialize, AnchorDeserialize)]
pub struct Pda {
    address: Pubkey,
    bump: u8,
}
//mostly a design choice whether to store derivable pdas in the market
//easier to store them with bumps bc u don't have to always pass bumps in to validate

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
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = token::Transfer {
            from: self.buyer_base_token_account.to_account_info(),
            to: self.market_base_treasury.to_account_info(),
            authority: self.buyer.to_account_info(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[error]
pub enum ErrorCode {
    #[msg("curve does not exist")]
    CurveDoesNotExist,
}

/*
        let billion: u64 = 3000000000;
        let sq = billion.checked_pow(2).unwrap();
        msg!("sq {}", sq);

        with this naive implementation, supply could not cross 3b ish


        just make it u128 and you're good
            let billion: u64 = 3000000000;
        let test = one_area_under_curve(9000000000000, 9000000000001);

*/
