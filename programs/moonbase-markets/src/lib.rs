use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};
use utils::anchor_transfer;

pub mod utils;

declare_id!("2gJLxMZ92AmEvC4PZEKgYj4EkyBojSVkdmLyDvKKVWym");

const MARKET_AUTHORITY_SEED: &[u8] = b"market_auth";
const TREASURY_SEED: &[u8] = b"treasury";
const MARKET_SEED: &[u8] = b"market";

#[program]
pub mod moonbase_markets {
    use super::*;
    pub fn new_market(
        ctx: Context<NewMarket>,
        market_bump: u8,
        market_authority_authority_bump: u8,
        market_treasury_bump: u8,
        name: String,
    ) -> ProgramResult {
        ctx.accounts.market.name = name;
        ctx.accounts.market.creator = ctx.accounts.creator.key();
        ctx.accounts.market.target_mint = ctx.accounts.target_mint.key();
        ctx.accounts.market.authority = Pda {
            address: ctx.accounts.market_authority.key(),
            bump: market_authority_authority_bump,
        };
        ctx.accounts.market.treasury = Pda {
            address: ctx.accounts.market_treasury.key(),
            bump: market_treasury_bump,
        };
        ctx.accounts.market.bump = market_bump;
        Ok(())
    }
    pub fn buy_tokens(ctx: Context<BuyTokens>, amount: u64) -> ProgramResult {
        //transfer tokens from buyer to treasury
        let total_price: u64 = amount.checked_mul(2).unwrap(); //example price calculation
        anchor_transfer::transfer_from_signer(
            ctx.accounts.into_receive_lamports_from_buyer_context(),
            total_price,
        )?;

        //mint tokens to buyer
        let seeds = &[
            &MARKET_AUTHORITY_SEED[..],
            ctx.accounts.market.target_mint.as_ref(),
            &[ctx.accounts.market.authority.bump],
        ];
        token::mint_to(
            ctx.accounts
                .into_mint_tokens_to_buyer_context()
                .with_signer(&[seeds]),
            amount.clone(),
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(market_bump: u8, market_authority_bump: u8, market_treasury_bump: u8)]
pub struct NewMarket<'info> {
    payer: Signer<'info>,
    creator: Signer<'info>,
    #[account(
        init,
        seeds = [MARKET_SEED, target_mint.key().as_ref()],
        bump = market_bump,
        payer = payer,
        space = 200,
    )]
    market: Account<'info, Market>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = market_authority,
    )]
    target_mint: Account<'info, token::Mint>,
    #[account(
        seeds = [MARKET_AUTHORITY_SEED, target_mint.key().as_ref()],
        bump = market_authority_bump,
    )]
    market_authority: AccountInfo<'info>,
    #[account(
        seeds = [TREASURY_SEED, target_mint.key().as_ref()],
        bump = market_treasury_bump,
    )]
    market_treasury: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    token_program: Program<'info, token::Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTokens<'info> {
    #[account(mut)]
    buyer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::authority = buyer,
        associated_token::mint = market_target_mint,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == market.target_mint,
    )]
    buyer_token_account: Account<'info, token::TokenAccount>,
    #[account(
        constraint = market.target_mint == market_target_mint.key(),
        constraint = market.authority.address == market_authority.key(),
        constraint = market.treasury.address == market_treasury.key(),
    )]
    market: Account<'info, Market>,
    #[account(mut)]
    market_target_mint: Account<'info, token::Mint>,
    market_authority: AccountInfo<'info>,
    #[account(mut)]
    market_treasury: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    associated_token_program: Program<'info, associated_token::AssociatedToken>,
    token_program: Program<'info, token::Token>,
    system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct Market {
    name: String,
    creator: Pubkey, //wallet of creator
    target_mint: Pubkey,
    authority: Pda, //derivable as pda -- can mint new tokens and transer out of treasury
    treasury: Pda,  //derivable as pda
    bump: u8,       //this is assuming base is sol
}

#[derive(Copy, Clone, Default, AnchorSerialize, AnchorDeserialize)]
pub struct Pda {
    address: Pubkey,
    bump: u8,
}
//mostly a design choice whether to store derivable pdas in the market
//easier to store them with bumps bc u don't have to always pass bumps in to validate

impl<'info> BuyTokens<'info> {
    pub fn into_mint_tokens_to_buyer_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, token::MintTo<'info>> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = token::MintTo {
            mint: self.market_target_mint.to_account_info(),
            to: self.buyer_token_account.to_account_info(),
            authority: self.market_authority.to_account_info(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
    pub fn into_receive_lamports_from_buyer_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, anchor_transfer::TransferLamports<'info>> {
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = anchor_transfer::TransferLamports {
            from: self.buyer.to_account_info(),
            to: self.market_treasury.to_account_info(),
            system_program: self.system_program.clone(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
