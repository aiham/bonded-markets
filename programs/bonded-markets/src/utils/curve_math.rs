use std::convert::TryFrom;

pub mod linear {
    use super::*;
    pub fn area_under_curve(a: u64, b: u64) -> u64 {
        let mut area = integration_from_zero(b as u128)
            .checked_sub(integration_from_zero(a as u128))
            .unwrap();
        area = area.checked_div(100000000).unwrap();
        u64::try_from(area).unwrap()
    }
    pub fn integration_from_zero(x: u128) -> u128 {
        let square = x.checked_pow(2).unwrap();
        square.checked_div(2).unwrap()
    }
}
pub mod quadratic {
    //not implemented but u would do it here
    pub fn area_under_curve(a: u64, b: u64) -> u64 {
        u64::MAX
    }
}
