//! End-to-end local integration tests on `litesvm`: load the compiled program, set up a
//! mock USDC mint + a fabricated Pyth price account, and drive the full lifecycle —
//! initialize → deposit → open → close → liquidate. Runs fully in-process (no validator).
//!
//!   cargo test -p impl-perps --test integration

use anchor_lang::{AccountDeserialize, AccountSerialize, InstructionData, Owner, ToAccountMetas};
use litesvm::LiteSVM;
use pyth_solana_receiver_sdk::price_update::{PriceFeedMessage, PriceUpdateV2, VerificationLevel};
use solana_sdk::{
    account::Account,
    clock::Clock,
    instruction::Instruction,
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_instruction, system_program,
    transaction::Transaction,
};

use impl_perps::instructions::{
    InitializeMarketParams, InitializeMockOracleParams, InitializeStateParams, OpenPositionParams,
    UpdateMarketArgs, UpdateMockOracleParams,
};
use impl_perps::math::{
    margin::{margin_requirement, position_notional},
    pnl::unrealized_pnl,
};
use impl_perps::state::{
    InsuranceFund, Market, MarketStatus, OracleSource, OrderTriggerCondition, OrderType,
    PositionDirection, State, User,
};

// ---- test fixtures ----
const USDC_DECIMALS: u8 = 6;
const ONE_USDC: u64 = 1_000_000; // 1e6
const ONE_SOL_BASE: u64 = 1_000_000_000; // 1e9 (BASE_PRECISION)
const PEG_PRECISION: u128 = 1_000_000;
const AMM_RESERVE_PRECISION: u128 = 1_000_000_000;
const NOW: i64 = 1_700_000_000;
const FEED_ID: [u8; 32] = [7u8; 32];

fn program_so() -> String {
    concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/impl_perps.so"
    )
    .to_string()
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &impl_perps::ID).0
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: &[Instruction], signers: &[&Keypair]) {
    let bh = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), signers, bh);
    if let Err(e) = svm.send_transaction(tx) {
        panic!("tx failed: {:?}\nlogs: {:#?}", e.err, e.meta.logs);
    }
}

fn try_send(svm: &mut LiteSVM, payer: &Keypair, ixs: &[Instruction], signers: &[&Keypair]) -> bool {
    svm.expire_blockhash();
    let bh = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), signers, bh);
    svm.send_transaction(tx).is_ok()
}

fn load<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acct = svm.get_account(key).expect("account missing");
    T::try_deserialize(&mut &acct.data[..]).expect("deserialize")
}

/// Create a fresh SPL mint with `payer` as mint authority.
fn create_mint(svm: &mut LiteSVM, payer: &Keypair) -> Pubkey {
    let mint = Keypair::new();
    let len = 82usize; // SPL Mint account size
    let lamports = Rent::default().minimum_balance(len);
    let create = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        lamports,
        len as u64,
        &spl_token::ID,
    );
    let init = spl_token::instruction::initialize_mint(
        &spl_token::ID,
        &mint.pubkey(),
        &payer.pubkey(),
        None,
        USDC_DECIMALS,
    )
    .unwrap();
    send(svm, payer, &[create, init], &[payer, &mint]);
    mint.pubkey()
}

/// Create an SPL token account for `owner` of `mint`.
fn create_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
) -> Pubkey {
    let acct = Keypair::new();
    let len = 165usize; // SPL token account size
    let lamports = Rent::default().minimum_balance(len);
    let create = system_instruction::create_account(
        &payer.pubkey(),
        &acct.pubkey(),
        lamports,
        len as u64,
        &spl_token::ID,
    );
    let init =
        spl_token::instruction::initialize_account3(&spl_token::ID, &acct.pubkey(), mint, owner)
            .unwrap();
    send(svm, payer, &[create, init], &[payer, &acct]);
    acct.pubkey()
}

fn mint_to(svm: &mut LiteSVM, payer: &Keypair, mint: &Pubkey, dest: &Pubkey, amount: u64) {
    let ix =
        spl_token::instruction::mint_to(&spl_token::ID, mint, dest, &payer.pubkey(), &[], amount)
            .unwrap();
    send(svm, payer, &[ix], &[payer]);
}

/// Write a fabricated, fully-verified Pyth price account (publish time = NOW).
fn set_pyth_price(svm: &mut LiteSVM, key: Pubkey, price: i64, expo: i32) {
    set_pyth_price_at(svm, key, price, expo, NOW);
}

/// Overwrite a program-owned account's data with a re-serialized Anchor account
/// (test-only fabrication of preconditions).
fn write_account<T: AccountSerialize>(svm: &mut LiteSVM, key: &Pubkey, value: &T) {
    let mut acct = svm.get_account(key).expect("account missing");
    let mut data = Vec::new();
    value.try_serialize(&mut data).unwrap();
    acct.data = data;
    svm.set_account(*key, acct).unwrap();
}

/// As `set_pyth_price`, but with an explicit publish time (used when warping the clock).
fn set_pyth_price_at(svm: &mut LiteSVM, key: Pubkey, price: i64, expo: i32, publish_time: i64) {
    set_pyth_price_feed(svm, key, FEED_ID, price, expo, publish_time);
}

/// As `set_pyth_price_at`, but with an explicit feed id (for additional markets).
fn set_pyth_price_feed(
    svm: &mut LiteSVM,
    key: Pubkey,
    feed_id: [u8; 32],
    price: i64,
    expo: i32,
    publish_time: i64,
) {
    let conf = (price.unsigned_abs() / 1000).max(1); // ~0.1% confidence
    let msg = PriceFeedMessage {
        feed_id,
        price,
        conf,
        exponent: expo,
        publish_time,
        prev_publish_time: publish_time,
        ema_price: price,
        ema_conf: conf,
    };
    let pa = PriceUpdateV2 {
        write_authority: Pubkey::default(),
        verification_level: VerificationLevel::Full,
        price_message: msg,
        posted_slot: 1,
    };
    let mut data = Vec::new();
    anchor_lang::AccountSerialize::try_serialize(&pa, &mut data).unwrap();
    let lamports = Rent::default().minimum_balance(data.len());
    svm.set_account(
        key,
        Account {
            lamports,
            data,
            owner: PriceUpdateV2::owner(),
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

/// A fully bootstrapped exchange: state, mock USDC, SOL-PERP market, fabricated oracle.
struct Env {
    svm: LiteSVM,
    admin: Keypair,
    mint: Pubkey,
    oracle: Pubkey,
}

impl Env {
    /// Bootstrap with a Pyth-sourced SOL-PERP market 0.
    fn new() -> Self {
        Self::bootstrap(false)
    }

    /// Bootstrap with a mock-oracle-sourced SOL-PERP market 0 (exercises `OracleSource::Mock`,
    /// the path the local validator uses). The mock oracle is the PDA `[b"mock_oracle", 0]`.
    fn new_mock() -> Self {
        Self::bootstrap(true)
    }

    fn bootstrap(use_mock: bool) -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(impl_perps::ID, program_so())
            .unwrap();

        // Deterministic clock so the fabricated oracle is fresh.
        svm.set_sysvar(&Clock {
            slot: 1,
            epoch_start_timestamp: NOW,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: NOW,
        });

        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 100 * 1_000_000_000).unwrap();

        let mint = create_mint(&mut svm, &admin);

        // initialize_state
        let state = pda(&[b"state"]);
        let vault_authority = pda(&[b"vault_authority"]);
        let collateral_vault = pda(&[b"collateral_vault"]);
        let insurance_vault = pda(&[b"insurance_vault"]);
        let insurance_fund = pda(&[b"insurance_fund"]);
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::InitializeState {
                state,
                vault_authority,
                collateral_mint: mint,
                collateral_vault,
                insurance_vault,
                insurance_fund,
                admin: admin.pubkey(),
                system_program: system_program::ID,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::InitializeState {
                params: InitializeStateParams {
                    taker_fee_bps: 10,
                    maker_rebate_bps: 0,
                    liquidation_fee_bps: 50,
                },
            }
            .data(),
        };
        send(&mut svm, &admin, &[ix], &[&admin]);

        // Oracle for market 0: a fabricated Pyth account, or a program-owned mock oracle.
        let (oracle, oracle_source) = if use_mock {
            let mock = pda(&[b"mock_oracle", &0u16.to_le_bytes()]);
            let ix = Instruction {
                program_id: impl_perps::ID,
                accounts: impl_perps::accounts::InitializeMockOracle {
                    state,
                    mock_oracle: mock,
                    admin: admin.pubkey(),
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
                data: impl_perps::instruction::InitializeMockOracle {
                    params: InitializeMockOracleParams {
                        market_index: 0,
                        price: 100_000_000,
                        conf: 100_000,
                    },
                }
                .data(),
            };
            send(&mut svm, &admin, &[ix], &[&admin]);
            (mock, OracleSource::Mock)
        } else {
            let o = Pubkey::new_unique();
            set_pyth_price(&mut svm, o, 100_000_000, -6);
            (o, OracleSource::Pyth)
        };

        // initialize_market (SOL-PERP, 10x init / 5% maint, deep reserves)
        let mut name = [0u8; 16];
        name[..8].copy_from_slice(b"SOL-PERP");
        let market = pda(&[b"market", &0u16.to_le_bytes()]);
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::InitializeMarket {
                state,
                market,
                admin: admin.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::InitializeMarket {
                params: InitializeMarketParams {
                    market_index: 0,
                    oracle,
                    oracle_source,
                    feed_id: FEED_ID,
                    name,
                    peg_multiplier: 100 * PEG_PRECISION,
                    amm_reserve: 10_000 * AMM_RESERVE_PRECISION,
                    margin_ratio_initial: 1_000,
                    margin_ratio_maintenance: 500,
                    max_leverage: 10,
                    min_order_base: ONE_SOL_BASE / 1000,
                    max_open_interest: 0,
                    liquidation_fee_bps: 50,
                    funding_period: 3600,
                },
            }
            .data(),
        };
        send(&mut svm, &admin, &[ix], &[&admin]);

        Env {
            svm,
            admin,
            mint,
            oracle,
        }
    }

    fn state(&self) -> Pubkey {
        pda(&[b"state"])
    }
    fn market(&self) -> Pubkey {
        pda(&[b"market", &0u16.to_le_bytes()])
    }
    fn market_pda(&self, i: u16) -> Pubkey {
        pda(&[b"market", &i.to_le_bytes()])
    }

    /// Initialize an additional market (index must equal current num_markets). Returns its
    /// fabricated oracle account. `price_1e6` is the price in PRICE_PRECISION.
    fn add_market(&mut self, market_index: u16, feed_id: [u8; 32], price_1e6: u64) -> Pubkey {
        let oracle = Pubkey::new_unique();
        set_pyth_price_feed(&mut self.svm, oracle, feed_id, price_1e6 as i64, -6, NOW);
        let mut name = [0u8; 16];
        name[..3].copy_from_slice(b"MKT");
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::InitializeMarket {
                state: self.state(),
                market: self.market_pda(market_index),
                admin: self.admin.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::InitializeMarket {
                params: InitializeMarketParams {
                    market_index,
                    oracle,
                    oracle_source: OracleSource::Pyth,
                    feed_id,
                    name,
                    peg_multiplier: price_1e6 as u128,
                    amm_reserve: 10_000 * AMM_RESERVE_PRECISION,
                    margin_ratio_initial: 1_000,
                    margin_ratio_maintenance: 500,
                    max_leverage: 10,
                    min_order_base: ONE_SOL_BASE / 1000,
                    max_open_interest: 0,
                    liquidation_fee_bps: 50,
                    funding_period: 3600,
                },
            }
            .data(),
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin]);
        oracle
    }
    fn user_pda(&self, authority: &Pubkey) -> Pubkey {
        pda(&[b"user", authority.as_ref()])
    }

    /// New funded trader with `usdc` deposited as collateral. Returns (keypair, token acct).
    fn new_trader(&mut self, usdc: u64) -> (Keypair, Pubkey) {
        let trader = Keypair::new();
        self.svm
            .airdrop(&trader.pubkey(), 100 * 1_000_000_000)
            .unwrap();

        // initialize_user
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::InitializeUser {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::InitializeUser {}.data(),
        };
        send(&mut self.svm, &trader, &[ix], &[&trader]);

        // fund + deposit
        let token_acct =
            create_token_account(&mut self.svm, &self.admin, &self.mint, &trader.pubkey());
        mint_to(&mut self.svm, &self.admin, &self.mint, &token_acct, usdc);

        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::DepositCollateral {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                user_token_account: token_acct,
                collateral_vault: pda(&[b"collateral_vault"]),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::DepositCollateral { amount: usdc }.data(),
        };
        send(&mut self.svm, &trader, &[ix], &[&trader]);

        (trader, token_acct)
    }

    fn open(&mut self, trader: &Keypair, direction: PositionDirection, base: u64) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::OpenPosition {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::OpenPosition {
                params: OpenPositionParams {
                    direction,
                    base_amount: base,
                    price_limit: 0,
                },
            }
            .data(),
        };
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    /// Admin: toggle the global circuit breaker.
    fn set_paused(&mut self, paused: bool) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::SetProtocolPaused {
                state: self.state(),
                admin: self.admin.pubkey(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::SetProtocolPaused { paused }.data(),
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin]);
    }

    /// Admin: retune market 0's status + initial margin (other params kept at init values).
    fn update_market(&mut self, status: MarketStatus, margin_ratio_initial: u32) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::UpdateMarket {
                state: self.state(),
                market: self.market(),
                admin: self.admin.pubkey(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::UpdateMarketParams {
                params: UpdateMarketArgs {
                    status,
                    margin_ratio_initial,
                    margin_ratio_maintenance: 500,
                    max_leverage: 10,
                    min_order_base: ONE_SOL_BASE / 1000,
                    max_open_interest: 0,
                    liquidation_fee_bps: 50,
                    funding_period: 3600,
                },
            }
            .data(),
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin]);
    }

    /// Attempt a market open; returns whether the tx succeeded (no panic on revert).
    fn try_open(&mut self, trader: &Keypair, direction: PositionDirection, base: u64) -> bool {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::OpenPosition {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::OpenPosition {
                params: OpenPositionParams {
                    direction,
                    base_amount: base,
                    price_limit: 0,
                },
            }
            .data(),
        };
        try_send(&mut self.svm, trader, &[ix], &[trader])
    }

    fn close(&mut self, trader: &Keypair, base: u64) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::ClosePosition {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::ClosePosition {
                params: impl_perps::instructions::ClosePositionParams {
                    base_amount: base,
                    price_limit: 0,
                },
            }
            .data(),
        };
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    fn withdraw(&mut self, trader: &Keypair, token_acct: Pubkey, amount: u64) {
        let ix = self.withdraw_ix(trader, token_acct, amount);
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    fn try_withdraw(&mut self, trader: &Keypair, token_acct: Pubkey, amount: u64) -> bool {
        let ix = self.withdraw_ix(trader, token_acct, amount);
        try_send(&mut self.svm, trader, &[ix], &[trader])
    }

    fn withdraw_ix(&self, trader: &Keypair, token_acct: Pubkey, amount: u64) -> Instruction {
        Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::WithdrawCollateral {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
                price_update: self.oracle,
                collateral_vault: pda(&[b"collateral_vault"]),
                vault_authority: pda(&[b"vault_authority"]),
                user_token_account: token_acct,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::WithdrawCollateral { amount }.data(),
        }
    }

    fn liquidate(&mut self, liquidator: &Keypair, target: &Pubkey, max_base: u64) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::LiquidatePerp {
                state: self.state(),
                liquidator: liquidator.pubkey(),
                user: self.user_pda(target),
                market: self.market(),
                price_update: self.oracle,
                insurance_fund: pda(&[b"insurance_fund"]),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::LiquidatePerp {
                max_base_amount: max_base,
            }
            .data(),
        };
        send(&mut self.svm, liquidator, &[ix], &[liquidator]);
    }

    /// Push a fresh price into market `market_index`'s mock oracle (admin authority).
    fn push_mock_price(&mut self, market_index: u16, price_1e6: u64) {
        let mock = pda(&[b"mock_oracle", &market_index.to_le_bytes()]);
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::UpdateMockOracle {
                mock_oracle: mock,
                authority: self.admin.pubkey(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::UpdateMockOracle {
                params: UpdateMockOracleParams {
                    price: price_1e6,
                    conf: (price_1e6 / 1000).max(1),
                },
            }
            .data(),
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin]);
    }

    fn update_funding(&mut self, cranker: &Keypair) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::UpdateFundingRate {
                state: self.state(),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::UpdateFundingRate {}.data(),
        };
        send(&mut self.svm, cranker, &[ix], &[cranker]);
    }

    fn settle_funding(&mut self, target: &Pubkey, payer: &Keypair) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::SettleFunding {
                state: self.state(),
                user: self.user_pda(target),
                market: self.market(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::SettleFunding {}.data(),
        };
        send(&mut self.svm, payer, &[ix], &[payer]);
    }

    fn resolve_bankruptcy(&mut self, target: &Pubkey, keeper: &Keypair) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::ResolvePerpBankruptcy {
                state: self.state(),
                keeper: keeper.pubkey(),
                user: self.user_pda(target),
                insurance_fund: pda(&[b"insurance_fund"]),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::ResolvePerpBankruptcy {}.data(),
        };
        send(&mut self.svm, keeper, &[ix], &[keeper]);
    }

    fn place_order(&mut self, trader: &Keypair, dir: PositionDirection, base: u64, price: u64) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::PlacePerpOrder {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::PlacePerpOrder {
                params: impl_perps::instructions::PlacePerpOrderParams {
                    order_type: OrderType::Limit,
                    direction: dir,
                    base_amount: base,
                    price,
                    trigger_price: 0,
                    trigger_condition: OrderTriggerCondition::Above,
                    reduce_only: false,
                    post_only: false,
                },
            }
            .data(),
        };
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    /// Place a reduce-only stop/TP (TriggerMarket) order.
    fn place_trigger(
        &mut self,
        trader: &Keypair,
        dir: PositionDirection,
        base: u64,
        trigger_price: u64,
        cond: OrderTriggerCondition,
    ) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::PlacePerpOrder {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::PlacePerpOrder {
                params: impl_perps::instructions::PlacePerpOrderParams {
                    order_type: OrderType::TriggerMarket,
                    direction: dir,
                    base_amount: base,
                    price: 0,
                    trigger_price,
                    trigger_condition: cond,
                    reduce_only: true,
                    post_only: false,
                },
            }
            .data(),
        };
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    /// Attempt a keeper trigger crank; returns whether the tx succeeded (no panic on revert).
    fn try_trigger(&mut self, keeper: &Keypair, target: &Pubkey, order_id: u32) -> bool {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::TriggerOrder {
                state: self.state(),
                filler: keeper.pubkey(),
                user: self.user_pda(target),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::TriggerOrder { order_id }.data(),
        };
        // Fresh blockhash each call so a repeated crank isn't rejected as a duplicate tx.
        self.svm.expire_blockhash();
        let bh = self.svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&keeper.pubkey()), &[keeper], bh);
        self.svm.send_transaction(tx).is_ok()
    }

    fn cancel_order(&mut self, trader: &Keypair, order_id: u32) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::CancelOrder {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::CancelOrder { order_id }.data(),
        };
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    fn fill_order(&mut self, filler: &Keypair, target: &Pubkey, order_id: u32) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::FillPerpOrder {
                state: self.state(),
                filler: filler.pubkey(),
                user: self.user_pda(target),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::FillPerpOrder { order_id }.data(),
        };
        send(&mut self.svm, filler, &[ix], &[filler]);
    }

    /// Place a reduce-only limit order (closes the position when a keeper fills it).
    fn place_reduce_limit(
        &mut self,
        trader: &Keypair,
        dir: PositionDirection,
        base: u64,
        price: u64,
    ) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::PlacePerpOrder {
                state: self.state(),
                user: self.user_pda(&trader.pubkey()),
                authority: trader.pubkey(),
                market: self.market(),
            }
            .to_account_metas(None),
            data: impl_perps::instruction::PlacePerpOrder {
                params: impl_perps::instructions::PlacePerpOrderParams {
                    order_type: OrderType::Limit,
                    direction: dir,
                    base_amount: base,
                    price,
                    trigger_price: 0,
                    trigger_condition: OrderTriggerCondition::Above,
                    reduce_only: true,
                    post_only: false,
                },
            }
            .data(),
        };
        send(&mut self.svm, trader, &[ix], &[trader]);
    }

    fn fill_match(
        &mut self,
        filler: &Keypair,
        taker: &Pubkey,
        taker_order_id: u32,
        maker: &Pubkey,
        maker_order_id: u32,
    ) {
        let ix = Instruction {
            program_id: impl_perps::ID,
            accounts: impl_perps::accounts::FillPerpMatch {
                state: self.state(),
                filler: filler.pubkey(),
                taker: self.user_pda(taker),
                maker: self.user_pda(maker),
                market: self.market(),
                price_update: self.oracle,
            }
            .to_account_metas(None),
            data: impl_perps::instruction::FillPerpMatch {
                taker_order_id,
                maker_order_id,
            }
            .data(),
        };
        send(&mut self.svm, filler, &[ix], &[filler]);
    }
}

fn initial_margin_boundary_withdraw_amount(user: &User, market: &Market) -> u64 {
    let pos = user
        .positions
        .iter()
        .find(|p| p.market_index == market.market_index && p.base_asset_amount != 0)
        .expect("open position");
    let oracle_price = 100_000_000;
    let notional = position_notional(pos.base_asset_amount, oracle_price).unwrap();
    let initial_margin = margin_requirement(notional, market.margin_ratio_initial).unwrap();
    let total_collateral = (user.collateral as i128)
        .checked_add(unrealized_pnl(pos, oracle_price).unwrap())
        .unwrap();
    let withdrawable = total_collateral
        .checked_sub(initial_margin as i128)
        .expect("account above initial margin");
    assert!(
        withdrawable > 0,
        "test setup must leave withdrawable collateral"
    );
    withdrawable as u64
}

#[test]
fn initializes_state_and_market() {
    let env = Env::new();
    let state: State = load(&env.svm, &env.state());
    assert_eq!(state.num_markets, 1);
    assert_eq!(state.collateral_mint, env.mint);
    assert_eq!(state.taker_fee_bps, 10);

    let market: Market = load(&env.svm, &env.market());
    assert_eq!(market.market_index, 0);
    assert_eq!(market.oracle, env.oracle);
    assert_eq!(market.margin_ratio_initial, 1_000);
    // mark price == peg == $100 (1e6)
    let mark =
        market.amm.quote_asset_reserve * market.amm.peg_multiplier / market.amm.base_asset_reserve;
    assert_eq!(mark, 100_000_000);
}

#[test]
fn deposit_open_long_then_close() {
    let mut env = Env::new();
    let (trader, _ta) = env.new_trader(1_000 * ONE_USDC);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    assert_eq!(user.collateral, 1_000 * ONE_USDC);

    // open 1 SOL long @ ~$100 (notional $100, IMR $10 << $1000 collateral)
    env.open(&trader, PositionDirection::Long, ONE_SOL_BASE);
    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let pos = user
        .positions
        .iter()
        .find(|p| p.base_asset_amount != 0)
        .unwrap();
    assert_eq!(pos.base_asset_amount, ONE_SOL_BASE as i64);
    assert!(pos.quote_entry_amount < 0); // paid quote to go long
    let collateral_after_open = user.collateral;
    assert!(collateral_after_open < 1_000 * ONE_USDC); // paid taker fee

    // full close
    env.close(&trader, 0);
    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    assert!(user.positions.iter().all(|p| p.base_asset_amount == 0));
    // round-trip at flat price costs ~2x fee + slippage; collateral slightly down, still most of it.
    assert!(user.collateral < collateral_after_open);
    assert!(user.collateral > 990 * ONE_USDC);
}

#[test]
fn underwater_position_is_liquidated() {
    let mut env = Env::new();
    let (trader, _ta) = env.new_trader(100 * ONE_USDC);

    // open 9 SOL long: notional ~$900, IMR ~$90 < $100 collateral (just under 10x).
    env.open(&trader, PositionDirection::Long, 9 * ONE_SOL_BASE);

    // price drops $100 -> $90: uPnL ~ -$90 wipes most collateral, MMR ~ $40.5 => liquidatable.
    set_pyth_price(&mut env.svm, env.oracle, 90_000_000, -6);

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.liquidate(&keeper, &trader.pubkey(), 0);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    assert!(user.positions.iter().all(|p| p.base_asset_amount == 0)); // force-closed
    assert!(!user.being_liquidated);
}

#[test]
fn funding_longs_pay_shorts_receive() {
    let mut env = Env::new();
    let (long, _) = env.new_trader(20_000 * ONE_USDC);
    let (short, _) = env.new_trader(20_000 * ONE_USDC);

    // Net long skew pushes the AMM mark above the $100 oracle.
    env.open(&long, PositionDirection::Long, 500 * ONE_SOL_BASE);
    env.open(&short, PositionDirection::Short, 200 * ONE_SOL_BASE);

    // Warp one funding period forward; refresh the oracle so it stays fresh at $100.
    let t1 = NOW + 3600;
    env.svm.set_sysvar(&Clock {
        slot: 2,
        epoch_start_timestamp: t1,
        epoch: 0,
        leader_schedule_epoch: 0,
        unix_timestamp: t1,
    });
    set_pyth_price_at(&mut env.svm, env.oracle, 100_000_000, -6, t1);

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.update_funding(&keeper);

    let market: Market = load(&env.svm, &env.market());
    assert!(
        market.amm.cumulative_funding_rate_long > 0,
        "mark above index => positive funding"
    );

    let long_before = load::<User>(&env.svm, &env.user_pda(&long.pubkey())).collateral;
    let short_before = load::<User>(&env.svm, &env.user_pda(&short.pubkey())).collateral;
    env.settle_funding(&long.pubkey(), &keeper);
    env.settle_funding(&short.pubkey(), &keeper);
    let long_after = load::<User>(&env.svm, &env.user_pda(&long.pubkey())).collateral;
    let short_after = load::<User>(&env.svm, &env.user_pda(&short.pubkey())).collateral;

    assert!(long_after < long_before, "long pays funding");
    assert!(short_after > short_before, "short receives funding");
}

#[test]
fn funding_shorts_pay_longs_when_mark_below_index() {
    let mut env = Env::new();
    let (short, _) = env.new_trader(20_000 * ONE_USDC);
    let (long, _) = env.new_trader(20_000 * ONE_USDC);

    // Net short skew pushes the AMM mark below the $100 oracle.
    env.open(&short, PositionDirection::Short, 500 * ONE_SOL_BASE);
    env.open(&long, PositionDirection::Long, 200 * ONE_SOL_BASE);

    let t1 = NOW + 3600;
    env.svm.set_sysvar(&Clock {
        slot: 2,
        epoch_start_timestamp: t1,
        epoch: 0,
        leader_schedule_epoch: 0,
        unix_timestamp: t1,
    });
    set_pyth_price_at(&mut env.svm, env.oracle, 100_000_000, -6, t1);

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.update_funding(&keeper);

    let market: Market = load(&env.svm, &env.market());
    assert!(
        market.amm.cumulative_funding_rate_long < 0,
        "mark below index => negative funding"
    );

    let short_before = load::<User>(&env.svm, &env.user_pda(&short.pubkey())).collateral;
    let long_before = load::<User>(&env.svm, &env.user_pda(&long.pubkey())).collateral;
    env.settle_funding(&short.pubkey(), &keeper);
    env.settle_funding(&long.pubkey(), &keeper);
    let short_after = load::<User>(&env.svm, &env.user_pda(&short.pubkey())).collateral;
    let long_after = load::<User>(&env.svm, &env.user_pda(&long.pubkey())).collateral;

    assert!(short_after < short_before, "short pays funding");
    assert!(long_after > long_before, "long receives funding");
}

#[test]
fn partial_liquidation_reduces_position() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(100 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, 9 * ONE_SOL_BASE);

    // Oracle drops to $85 => below maintenance margin.
    set_pyth_price(&mut env.svm, env.oracle, 85_000_000, -6);

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    // Close only 4.5 of the 9 SOL.
    env.liquidate(&keeper, &trader.pubkey(), 4_500_000_000);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let pos = user
        .positions
        .iter()
        .find(|p| p.base_asset_amount != 0)
        .expect("position partially open");
    assert_eq!(pos.base_asset_amount, 4_500_000_000);
}

#[test]
fn bankruptcy_resolved_from_insurance() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(100 * ONE_USDC);
    let user_pda = env.user_pda(&trader.pubkey());

    // Fabricate a bankrupt account with recorded bad debt.
    let mut u: User = load(&env.svm, &user_pda);
    u.bankrupt = true;
    u.bad_debt = 50 * ONE_USDC;
    write_account(&mut env.svm, &user_pda, &u);

    // Fund the insurance pool above the bad debt.
    let if_pda = pda(&[b"insurance_fund"]);
    let mut f: InsuranceFund = load(&env.svm, &if_pda);
    f.total_deposits = 100 * ONE_USDC;
    write_account(&mut env.svm, &if_pda, &f);

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.resolve_bankruptcy(&trader.pubkey(), &keeper);

    let u: User = load(&env.svm, &user_pda);
    assert!(!u.bankrupt);
    assert_eq!(u.bad_debt, 0);
    let f: InsuranceFund = load(&env.svm, &if_pda);
    assert_eq!(f.total_deposits, 50 * ONE_USDC);
}

#[test]
fn limit_order_fills_against_amm() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);

    // Buy-limit at $101 is marketable (AMM ~$100 <= $101), so the keeper can fill it.
    env.place_order(&trader, PositionDirection::Long, ONE_SOL_BASE, 101_000_000);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let order = user
        .orders
        .iter()
        .find(|o| o.base_asset_amount != 0)
        .expect("order resting");
    assert_eq!(order.base_asset_amount, ONE_SOL_BASE);
    let order_id = order.order_id;

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.fill_order(&keeper, &trader.pubkey(), order_id);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let pos = user
        .positions
        .iter()
        .find(|p| p.base_asset_amount != 0)
        .expect("position opened by fill");
    assert_eq!(pos.base_asset_amount, ONE_SOL_BASE as i64);
    assert!(
        user.orders.iter().all(|o| o.base_asset_amount == 0),
        "order consumed by fill"
    );
}

#[test]
fn cancel_removes_resting_order() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);

    env.place_order(&trader, PositionDirection::Long, ONE_SOL_BASE, 99_000_000);
    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let order_id = user
        .orders
        .iter()
        .find(|o| o.base_asset_amount != 0)
        .expect("resting")
        .order_id;

    env.cancel_order(&trader, order_id);
    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    assert!(
        user.orders.iter().all(|o| o.base_asset_amount == 0),
        "order canceled"
    );
}

#[test]
fn two_markets_are_independent() {
    let mut env = Env::new(); // market 0 = SOL @ $100
    env.add_market(1, [8u8; 32], 50_000 * 1_000_000); // market 1 = BTC @ $50k

    let state: State = load(&env.svm, &env.state());
    assert_eq!(state.num_markets, 2);

    // Trade on market 0 only; market 1's AMM must be untouched.
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, ONE_SOL_BASE);

    let m0: Market = load(&env.svm, &env.market_pda(0));
    let m1: Market = load(&env.svm, &env.market_pda(1));
    assert!(m0.open_interest_long > 0, "market 0 traded");
    assert_eq!(m1.open_interest_long, 0, "market 1 untouched");
    assert_eq!(m1.market_index, 1);
}

/// The mock-oracle source (used by the local validator) is read by the margin engine: an
/// account that is healthy at the entry price ($100) becomes liquidatable only after the
/// authority pushes a lower price ($85) into the mock oracle. The liquidation succeeding is
/// itself the proof that the pushed price is what the program consumed.
#[test]
fn mock_oracle_drives_margin_and_liquidation() {
    let mut env = Env::new_mock();
    let (trader, _) = env.new_trader(100 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, 9 * ONE_SOL_BASE);

    // At entry ($100, 0 uPnL) the account is healthy: maintenance margin ≈ 5% · $900 = $45
    // < $100 collateral. Push the mock index down to $85 so uPnL ≈ -$135 → liquidatable.
    env.push_mock_price(0, 85_000_000);

    let if_before: InsuranceFund = load(&env.svm, &pda(&[b"insurance_fund"]));

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.liquidate(&keeper, &trader.pubkey(), 0); // 0 = full close

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let base = user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap_or(0);
    assert_eq!(base, 0, "full liquidation closes the long");

    let if_after: InsuranceFund = load(&env.svm, &pda(&[b"insurance_fund"]));
    assert!(
        if_after.total_deposits > if_before.total_deposits,
        "liquidation fee accrues to the insurance fund"
    );
}

/// A reduce-only stop-loss fires only once the oracle crosses its trigger, then closes the
/// position against the AMM (Phase 3b: stop-loss / take-profit via `trigger_order`).
#[test]
fn stop_loss_trigger_closes_long() {
    let mut env = Env::new(); // SOL-PERP @ $100
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, 10 * ONE_SOL_BASE);

    // Stop-loss: reduce the long when the index falls to $90 or below.
    env.place_trigger(
        &trader,
        PositionDirection::Short,
        10 * ONE_SOL_BASE,
        90_000_000,
        OrderTriggerCondition::Below,
    );

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();

    // At $100 the stop ($90, Below) is not crossed → the crank reverts (no-op).
    assert!(
        !env.try_trigger(&keeper, &trader.pubkey(), 0),
        "stop must not fire above its trigger price"
    );

    // Index drops to $88 → the stop fires.
    set_pyth_price(&mut env.svm, env.oracle, 88_000_000, -6);
    assert!(
        env.try_trigger(&keeper, &trader.pubkey(), 0),
        "stop fires once the oracle crosses below the trigger"
    );

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let base = user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap_or(0);
    assert_eq!(base, 0, "stop-loss closed the long");
    assert!(
        user.orders.iter().all(|o| !o.is_open()),
        "the trigger order is consumed after firing"
    );
}

/// A take-profit trigger for a long uses the `Above` condition and closes only after the
/// oracle reaches the target.
#[test]
fn take_profit_trigger_above_closes_long() {
    let mut env = Env::new(); // SOL-PERP @ $100
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, 5 * ONE_SOL_BASE);

    env.place_trigger(
        &trader,
        PositionDirection::Short,
        5 * ONE_SOL_BASE,
        110_000_000,
        OrderTriggerCondition::Above,
    );

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();

    assert!(
        !env.try_trigger(&keeper, &trader.pubkey(), 0),
        "take-profit must not fire below its trigger price"
    );

    set_pyth_price(&mut env.svm, env.oracle, 115_000_000, -6);
    assert!(
        env.try_trigger(&keeper, &trader.pubkey(), 0),
        "take-profit fires once the oracle crosses above the trigger"
    );

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let base = user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap_or(0);
    assert_eq!(base, 0, "take-profit closed the long");
    assert!(
        user.orders.iter().all(|o| !o.is_open()),
        "the trigger order is consumed after firing"
    );
}

/// A reduce-only limit order, when filled by a keeper, closes (not flips) the position.
#[test]
fn reduce_only_limit_fill_closes_long() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, 5 * ONE_SOL_BASE);

    // Reduce-only sell limit at $95; the AMM close (~$100) clears the $95 floor, so it fills.
    env.place_reduce_limit(
        &trader,
        PositionDirection::Short,
        5 * ONE_SOL_BASE,
        95_000_000,
    );

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.fill_order(&keeper, &trader.pubkey(), 0);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let base = user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap_or(0);
    assert_eq!(base, 0, "reduce-only limit fill closed the long");
}

/// A reduce-only close larger than the position is clamped to the open size and cannot flip.
#[test]
fn reduce_only_over_close_clamps_to_position_size() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);
    env.open(&trader, PositionDirection::Long, 5 * ONE_SOL_BASE);

    env.place_reduce_limit(
        &trader,
        PositionDirection::Short,
        10 * ONE_SOL_BASE,
        95_000_000,
    );

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.fill_order(&keeper, &trader.pubkey(), 0);

    let user: User = load(&env.svm, &env.user_pda(&trader.pubkey()));
    let base = user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap_or(0);
    assert_eq!(
        base, 0,
        "over-sized reduce-only order closed but did not flip"
    );
    assert!(
        user.orders.iter().all(|o| !o.is_open()),
        "over-close order is cleared once the position is flat"
    );
}

/// Two crossing resting limit orders are matched peer-to-peer at the maker's price.
#[test]
fn maker_match_crosses_two_orders() {
    let mut env = Env::new();
    let (a, _) = env.new_trader(10_000 * ONE_USDC);
    let (b, _) = env.new_trader(10_000 * ONE_USDC);

    // A bids 3 SOL @ $101 (taker); B asks 3 SOL @ $99 (maker) → cross, fill at maker $99.
    env.place_order(&a, PositionDirection::Long, 3 * ONE_SOL_BASE, 101_000_000);
    env.place_order(&b, PositionDirection::Short, 3 * ONE_SOL_BASE, 99_000_000);

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.fill_match(&keeper, &a.pubkey(), 0, &b.pubkey(), 0);

    let ua: User = load(&env.svm, &env.user_pda(&a.pubkey()));
    let ub: User = load(&env.svm, &env.user_pda(&b.pubkey()));
    let abase = ua
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap();
    let bbase = ub
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap();
    assert_eq!(abase, (3 * ONE_SOL_BASE) as i64, "taker is long 3 SOL");
    assert_eq!(bbase, -((3 * ONE_SOL_BASE) as i64), "maker is short 3 SOL");
    // Both opened at the maker price: the long paid quote (negative cost basis).
    let aq = ua
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .unwrap()
        .quote_entry_amount;
    assert!(aq < 0, "long position has a negative (paid) cost basis");
}

/// Unequal maker/taker sizes fill the smaller leg and leave the maker's remainder resting.
#[test]
fn partial_maker_match_leaves_resting_remainder() {
    let mut env = Env::new();
    let (taker, _) = env.new_trader(10_000 * ONE_USDC);
    let (maker, _) = env.new_trader(10_000 * ONE_USDC);

    env.place_order(
        &taker,
        PositionDirection::Long,
        2 * ONE_SOL_BASE,
        101_000_000,
    );
    env.place_order(
        &maker,
        PositionDirection::Short,
        5 * ONE_SOL_BASE,
        99_000_000,
    );

    let keeper = Keypair::new();
    env.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    env.fill_match(&keeper, &taker.pubkey(), 0, &maker.pubkey(), 0);

    let taker_user: User = load(&env.svm, &env.user_pda(&taker.pubkey()));
    let maker_user: User = load(&env.svm, &env.user_pda(&maker.pubkey()));

    let taker_base = taker_user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap();
    let maker_base = maker_user
        .positions
        .iter()
        .find(|p| p.market_index == 0)
        .map(|p| p.base_asset_amount)
        .unwrap();
    assert_eq!(
        taker_base,
        (2 * ONE_SOL_BASE) as i64,
        "taker filled its full bid"
    );
    assert_eq!(
        maker_base,
        -((2 * ONE_SOL_BASE) as i64),
        "maker filled only 2 SOL"
    );
    assert!(
        taker_user.orders.iter().all(|o| !o.is_open()),
        "smaller taker order was consumed"
    );

    let maker_order = maker_user
        .orders
        .iter()
        .find(|o| o.is_open())
        .expect("maker remainder rests");
    assert_eq!(maker_order.base_asset_amount, 5 * ONE_SOL_BASE);
    assert_eq!(maker_order.base_asset_amount_filled, 2 * ONE_SOL_BASE);
    assert_eq!(maker_order.remaining_base(), 3 * ONE_SOL_BASE);
}

#[test]
fn withdraw_at_initial_margin_boundary_allowed_one_unit_past_rejected() {
    let mut allowed = Env::new();
    let (trader, token_acct) = allowed.new_trader(1_000 * ONE_USDC);
    allowed.open(&trader, PositionDirection::Long, 5 * ONE_SOL_BASE);

    let user_before: User = load(&allowed.svm, &allowed.user_pda(&trader.pubkey()));
    let market: Market = load(&allowed.svm, &allowed.market());
    let withdraw_amount = initial_margin_boundary_withdraw_amount(&user_before, &market);
    allowed.withdraw(&trader, token_acct, withdraw_amount);

    let user_after: User = load(&allowed.svm, &allowed.user_pda(&trader.pubkey()));
    assert_eq!(
        user_after.collateral,
        user_before.collateral - withdraw_amount,
        "exact initial-margin boundary withdrawal succeeds"
    );

    let mut rejected = Env::new();
    let (trader, token_acct) = rejected.new_trader(1_000 * ONE_USDC);
    rejected.open(&trader, PositionDirection::Long, 5 * ONE_SOL_BASE);

    let user_before: User = load(&rejected.svm, &rejected.user_pda(&trader.pubkey()));
    let market: Market = load(&rejected.svm, &rejected.market());
    let withdraw_amount = initial_margin_boundary_withdraw_amount(&user_before, &market);
    assert!(
        !rejected.try_withdraw(&trader, token_acct, withdraw_amount + 1),
        "one unit past the initial-margin boundary is rejected"
    );
    let user_after: User = load(&rejected.svm, &rejected.user_pda(&trader.pubkey()));
    assert_eq!(
        user_after.collateral, user_before.collateral,
        "rejected withdrawal leaves collateral unchanged"
    );
}

/// Admin can retune a market and halt it: `ReduceOnly` blocks new opens; re-`Active` restores.
#[test]
fn admin_retunes_and_halts_market() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);

    env.update_market(MarketStatus::ReduceOnly, 2_000);
    let market: Market = load(&env.svm, &env.market());
    assert_eq!(
        market.margin_ratio_initial, 2_000,
        "initial-margin param updated"
    );
    assert_eq!(market.status, MarketStatus::ReduceOnly, "status updated");
    assert!(
        !env.try_open(&trader, PositionDirection::Long, ONE_SOL_BASE),
        "opening rejected while the market is not Active"
    );

    env.update_market(MarketStatus::Active, 1_000);
    assert!(
        env.try_open(&trader, PositionDirection::Long, ONE_SOL_BASE),
        "opening allowed once the market is Active again"
    );
}

/// The global circuit breaker blocks user-facing opens, then re-allows them when lifted.
#[test]
fn protocol_pause_blocks_opens() {
    let mut env = Env::new();
    let (trader, _) = env.new_trader(10_000 * ONE_USDC);

    env.set_paused(true);
    assert!(
        !env.try_open(&trader, PositionDirection::Long, ONE_SOL_BASE),
        "opening rejected while the protocol is paused"
    );

    env.set_paused(false);
    assert!(
        env.try_open(&trader, PositionDirection::Long, ONE_SOL_BASE),
        "opening allowed after the protocol is unpaused"
    );
}
