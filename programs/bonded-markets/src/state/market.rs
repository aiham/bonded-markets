use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Market {
    pub name: String,
    pub creator: Pubkey, //wallet of creator
    pub base_mint: Pubkey,
    pub target_mint: Pubkey,
    pub amount_burned: u64,
    pub base_treasury: Pda, //derivable as pda
    pub authority: Pda,     //derivable as pda -- can mint new tokens and transer out of treasury
    pub curve: Curve,
    pub bump: u8, //this is assuming base is sol
}
//size (181) + 3 + string bytes (20 char)

#[derive(Copy, Clone, Default, AnchorSerialize, AnchorDeserialize)]
pub struct Pda {
    pub address: Pubkey,
    pub bump: u8,
}
//mostly a design choice whether to store derivable pdas in the market
//easier to store them with bumps bc u don't have to always pass bumps in to validate

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum Curve {
    Linear,
    Quadratic,
}
impl Default for Curve {
    fn default() -> Curve {
        Curve::Linear
    }
}
impl Curve {
    pub fn from(num: u8) -> Option<Curve> {
        if num == 0 {
            Some(Curve::Linear)
        } else if num == 1 {
            Some(Curve::Quadratic)
        } else {
            None
        }
    }
}
