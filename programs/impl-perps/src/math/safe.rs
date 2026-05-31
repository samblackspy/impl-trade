//! Safe arithmetic helpers. DeFi money math must never wrap or divide by zero — every
//! value-moving operation goes through `checked_*` and surfaces `MathOverflow`.

use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

pub trait SafeMath: Sized + Copy {
    fn safe_add(self, rhs: Self) -> Result<Self>;
    fn safe_sub(self, rhs: Self) -> Result<Self>;
    fn safe_mul(self, rhs: Self) -> Result<Self>;
    /// Integer division (truncates toward zero). Division by zero -> `MathOverflow`.
    fn safe_div(self, rhs: Self) -> Result<Self>;
}

macro_rules! impl_safe_math {
    ($t:ty) => {
        impl SafeMath for $t {
            #[inline(always)]
            fn safe_add(self, rhs: Self) -> Result<Self> {
                self.checked_add(rhs)
                    .ok_or_else(|| error!(ErrorCode::MathOverflow))
            }
            #[inline(always)]
            fn safe_sub(self, rhs: Self) -> Result<Self> {
                self.checked_sub(rhs)
                    .ok_or_else(|| error!(ErrorCode::MathOverflow))
            }
            #[inline(always)]
            fn safe_mul(self, rhs: Self) -> Result<Self> {
                self.checked_mul(rhs)
                    .ok_or_else(|| error!(ErrorCode::MathOverflow))
            }
            #[inline(always)]
            fn safe_div(self, rhs: Self) -> Result<Self> {
                self.checked_div(rhs)
                    .ok_or_else(|| error!(ErrorCode::MathOverflow))
            }
        }
    };
}

impl_safe_math!(u64);
impl_safe_math!(u128);
impl_safe_math!(i64);
impl_safe_math!(i128);

/// Ceiling division for unsigned values: `ceil(a / b)`. Used where we must round a
/// quote amount *against the user* (they pay more / receive less).
pub fn div_ceil(a: u128, b: u128) -> Result<u128> {
    require!(b != 0, ErrorCode::MathOverflow);
    if a == 0 {
        return Ok(0);
    }
    a.safe_sub(1)?.safe_div(b)?.safe_add(1)
}

pub fn cast_u64(x: u128) -> Result<u64> {
    u64::try_from(x).map_err(|_| error!(ErrorCode::MathOverflow))
}

pub fn cast_i64(x: i128) -> Result<i64> {
    i64::try_from(x).map_err(|_| error!(ErrorCode::MathOverflow))
}
