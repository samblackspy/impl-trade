/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/impl_perps.json`.
 */
export type ImplPerps = {
  "address": "BCA9Q2N8HXW48KB5hh9QFH4LT4gzyiCf4Qkx5ZwDcM5d",
  "metadata": {
    "name": "implPerps",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "impl.trade perpetual futures DEX program"
  },
  "instructions": [
    {
      "name": "cancelOrder",
      "docs": [
        "Cancel a resting order by id."
      ],
      "discriminator": [
        95,
        129,
        237,
        240,
        8,
        49,
        223,
        132
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "user"
          ]
        }
      ],
      "args": [
        {
          "name": "orderId",
          "type": "u32"
        }
      ]
    },
    {
      "name": "closePosition",
      "docs": [
        "Reduce/close a position via the vAMM."
      ],
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "user"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "closePositionParams"
            }
          }
        }
      ]
    },
    {
      "name": "depositCollateral",
      "docs": [
        "Deposit USDC collateral."
      ],
      "discriminator": [
        156,
        131,
        142,
        116,
        146,
        247,
        162,
        120
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "user"
          ]
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fillPerpMatch",
      "docs": [
        "Keeper: cross two resting limit orders against each other (maker-vs-maker)."
      ],
      "discriminator": [
        210,
        166,
        2,
        137,
        237,
        245,
        238,
        87
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "filler",
          "docs": [
            "Permissionless cranker (keeper)."
          ],
          "signer": true
        },
        {
          "name": "taker",
          "docs": [
            "The aggressing order's owner. Crosses at the maker's price."
          ],
          "writable": true
        },
        {
          "name": "maker",
          "docs": [
            "The resting order's owner (gets price priority + the maker rebate)."
          ],
          "writable": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        }
      ],
      "args": [
        {
          "name": "takerOrderId",
          "type": "u32"
        },
        {
          "name": "makerOrderId",
          "type": "u32"
        }
      ]
    },
    {
      "name": "fillPerpOrder",
      "docs": [
        "Keeper: fill a resting limit order against the AMM (opening or reduce-only)."
      ],
      "discriminator": [
        13,
        188,
        248,
        103,
        134,
        217,
        106,
        240
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "filler",
          "docs": [
            "Permissionless filler (keeper)."
          ],
          "signer": true
        },
        {
          "name": "user",
          "writable": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        }
      ],
      "args": [
        {
          "name": "orderId",
          "type": "u32"
        }
      ]
    },
    {
      "name": "initializeMarket",
      "docs": [
        "Create a perp market with a balanced vAMM (admin)."
      ],
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "params.market_index"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "state"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeMarketParams"
            }
          }
        }
      ]
    },
    {
      "name": "initializeMockOracle",
      "docs": [
        "Create a program-owned mock price account (admin; local/dev only)."
      ],
      "discriminator": [
        18,
        149,
        36,
        131,
        144,
        177,
        67,
        101
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "mockOracle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  99,
                  107,
                  95,
                  111,
                  114,
                  97,
                  99,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "params.market_index"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "state"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeMockOracleParams"
            }
          }
        }
      ]
    },
    {
      "name": "initializeState",
      "docs": [
        "One-time global setup (admin)."
      ],
      "discriminator": [
        190,
        171,
        224,
        219,
        217,
        72,
        199,
        176
      ],
      "accounts": [
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "insuranceVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "insuranceFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeStateParams"
            }
          }
        }
      ]
    },
    {
      "name": "initializeUser",
      "docs": [
        "Create the caller's user account."
      ],
      "discriminator": [
        111,
        17,
        185,
        250,
        60,
        122,
        38,
        254
      ],
      "accounts": [
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidatePerp",
      "docs": [
        "Permissionless liquidation of an under-maintenance account (keeper)."
      ],
      "discriminator": [
        75,
        35,
        119,
        247,
        191,
        18,
        139,
        2
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "liquidator",
          "docs": [
            "Whoever cranks the liquidation (typically a keeper). Permissionless by design."
          ],
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "The account being liquidated. `Account<User>` guarantees a real program-owned user."
          ],
          "writable": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        },
        {
          "name": "insuranceFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "maxBaseAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openPosition",
      "docs": [
        "Open/increase a position via the vAMM (market order)."
      ],
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "user"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "openPositionParams"
            }
          }
        }
      ]
    },
    {
      "name": "placePerpOrder",
      "docs": [
        "Rest a limit order."
      ],
      "discriminator": [
        69,
        161,
        93,
        202,
        120,
        126,
        76,
        185
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "user"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "placePerpOrderParams"
            }
          }
        }
      ]
    },
    {
      "name": "resolvePerpBankruptcy",
      "docs": [
        "Cover a bankrupt account's bad debt from the insurance fund (keeper)."
      ],
      "discriminator": [
        224,
        16,
        176,
        214,
        162,
        213,
        183,
        222
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "keeper",
          "docs": [
            "Permissionless crank (keeper)."
          ],
          "signer": true
        },
        {
          "name": "user",
          "writable": true
        },
        {
          "name": "insuranceFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "setProtocolPaused",
      "docs": [
        "Global circuit breaker: pause/unpause all user-facing position changes (admin)."
      ],
      "discriminator": [
        47,
        62,
        75,
        69,
        166,
        0,
        147,
        157
      ],
      "accounts": [
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "state"
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleFunding",
      "docs": [
        "Apply a position's accrued funding to its collateral (permissionless crank)."
      ],
      "discriminator": [
        11,
        251,
        12,
        161,
        199,
        228,
        133,
        87
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "triggerOrder",
      "docs": [
        "Keeper: execute a stop-loss / take-profit when the oracle crosses its trigger."
      ],
      "discriminator": [
        63,
        112,
        51,
        233,
        232,
        47,
        240,
        199
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "filler",
          "docs": [
            "Permissionless cranker (keeper)."
          ],
          "signer": true
        },
        {
          "name": "user",
          "writable": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        }
      ],
      "args": [
        {
          "name": "orderId",
          "type": "u32"
        }
      ]
    },
    {
      "name": "updateFundingRate",
      "docs": [
        "Keeper crank: refresh TWAPs + accrue funding for a market."
      ],
      "discriminator": [
        201,
        178,
        116,
        212,
        166,
        144,
        72,
        238
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateMarketParams",
      "docs": [
        "Retune a market's risk params + status (admin). Status flips Active / ReduceOnly /",
        "Paused — a per-market circuit breaker."
      ],
      "discriminator": [
        70,
        117,
        202,
        191,
        205,
        174,
        92,
        82
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "state"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateMarketArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateMockOracle",
      "docs": [
        "Push a fresh price into a mock oracle (authority; local/dev only)."
      ],
      "discriminator": [
        196,
        202,
        24,
        173,
        225,
        179,
        237,
        168
      ],
      "accounts": [
        {
          "name": "mockOracle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  99,
                  107,
                  95,
                  111,
                  114,
                  97,
                  99,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mock_oracle.market_index",
                "account": "mockOracle"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "mockOracle"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateMockOracleParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawCollateral",
      "docs": [
        "Withdraw USDC collateral (subject to initial-margin solvency)."
      ],
      "discriminator": [
        115,
        135,
        168,
        106,
        139,
        214,
        138,
        150
      ],
      "accounts": [
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "user"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_index",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "`load_oracle_price` according to `market.oracle_source`."
          ]
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "insuranceFund",
      "discriminator": [
        43,
        134,
        170,
        87,
        102,
        16,
        142,
        147
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "mockOracle",
      "discriminator": [
        208,
        74,
        71,
        99,
        160,
        22,
        158,
        240
      ]
    },
    {
      "name": "state",
      "discriminator": [
        216,
        146,
        107,
        94,
        104,
        75,
        182,
        177
      ]
    },
    {
      "name": "user",
      "discriminator": [
        159,
        117,
        95,
        227,
        239,
        151,
        58,
        236
      ]
    }
  ],
  "events": [
    {
      "name": "fundingRecord",
      "discriminator": [
        33,
        73,
        88,
        73,
        57,
        33,
        152,
        61
      ]
    },
    {
      "name": "liquidationRecord",
      "discriminator": [
        127,
        17,
        0,
        108,
        182,
        13,
        231,
        53
      ]
    },
    {
      "name": "tradeRecord",
      "discriminator": [
        190,
        168,
        133,
        228,
        17,
        212,
        185,
        128
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6001,
      "name": "marketNotActive",
      "msg": "Market is not in an active/tradeable status"
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6003,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6004,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6005,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral"
    },
    {
      "code": 6006,
      "name": "insufficientFreeCollateral",
      "msg": "Insufficient free collateral for this action"
    },
    {
      "code": 6007,
      "name": "invalidMarketIndex",
      "msg": "Invalid market index"
    },
    {
      "code": 6008,
      "name": "staleOracle",
      "msg": "Oracle price is stale"
    },
    {
      "code": 6009,
      "name": "oracleConfidenceTooWide",
      "msg": "Oracle confidence interval is too wide"
    },
    {
      "code": 6010,
      "name": "invalidOraclePrice",
      "msg": "Oracle price is invalid (non-positive)"
    },
    {
      "code": 6011,
      "name": "invalidOracleFeed",
      "msg": "Oracle feed id does not match the market"
    },
    {
      "code": 6012,
      "name": "positionNotFound",
      "msg": "Position not found"
    },
    {
      "code": 6013,
      "name": "maxPositionsReached",
      "msg": "No available position slot"
    },
    {
      "code": 6014,
      "name": "positionStillOpen",
      "msg": "Position is still open"
    },
    {
      "code": 6015,
      "name": "slippageExceeded",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6016,
      "name": "orderTooSmall",
      "msg": "Order size is below the market minimum"
    },
    {
      "code": 6017,
      "name": "maxLeverageExceeded",
      "msg": "Maximum leverage exceeded"
    },
    {
      "code": 6018,
      "name": "maxOpenInterestExceeded",
      "msg": "Open interest cap exceeded"
    },
    {
      "code": 6019,
      "name": "notLiquidatable",
      "msg": "Position is not liquidatable"
    },
    {
      "code": 6020,
      "name": "beingLiquidated",
      "msg": "Account is currently being liquidated"
    },
    {
      "code": 6021,
      "name": "reduceOnlyViolation",
      "msg": "Reduce-only order would increase the position"
    },
    {
      "code": 6022,
      "name": "ordersFull",
      "msg": "No available order slot"
    },
    {
      "code": 6023,
      "name": "orderNotFound",
      "msg": "Order not found"
    },
    {
      "code": 6024,
      "name": "unsupportedOrderType",
      "msg": "Unsupported order type for this action"
    },
    {
      "code": 6025,
      "name": "triggerConditionNotMet",
      "msg": "Trigger condition is not yet met"
    },
    {
      "code": 6026,
      "name": "ordersDoNotCross",
      "msg": "Orders do not cross (same side, or prices don't overlap)"
    },
    {
      "code": 6027,
      "name": "selfMatch",
      "msg": "Cannot match an account against itself"
    }
  ],
  "types": [
    {
      "name": "amm",
      "docs": [
        "Virtual AMM. Reserves are *virtual* (no tokens held) and in `AMM_RESERVE_PRECISION`.",
        "Mark price = quote_asset_reserve * peg_multiplier / base_asset_reserve (PRICE_PRECISION)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "baseAssetReserve",
            "type": "u128"
          },
          {
            "name": "quoteAssetReserve",
            "type": "u128"
          },
          {
            "name": "sqrtK",
            "type": "u128"
          },
          {
            "name": "pegMultiplier",
            "type": "u128"
          },
          {
            "name": "baseAssetAmountLong",
            "docs": [
              "Net base held by longs / shorts via the AMM (for skew + funding)."
            ],
            "type": "i128"
          },
          {
            "name": "baseAssetAmountShort",
            "type": "i128"
          },
          {
            "name": "cumulativeFundingRateLong",
            "docs": [
              "Cumulative funding (per base unit) paid by longs / shorts."
            ],
            "type": "i128"
          },
          {
            "name": "cumulativeFundingRateShort",
            "type": "i128"
          },
          {
            "name": "lastFundingRate",
            "type": "i128"
          },
          {
            "name": "lastFundingTs",
            "type": "i64"
          },
          {
            "name": "lastMarkPriceTwap",
            "docs": [
              "TWAP accumulators (PRICE_PRECISION)."
            ],
            "type": "u64"
          },
          {
            "name": "lastOraclePriceTwap",
            "type": "u64"
          },
          {
            "name": "lastTwapTs",
            "type": "i64"
          },
          {
            "name": "totalFee",
            "docs": [
              "Lifetime fees collected by the AMM (QUOTE_PRECISION)."
            ],
            "type": "i128"
          }
        ]
      }
    },
    {
      "name": "closePositionParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "baseAmount",
            "docs": [
              "Base magnitude to close (BASE_PRECISION). 0 = full close."
            ],
            "type": "u64"
          },
          {
            "name": "priceLimit",
            "docs": [
              "Slippage guard (PRICE_PRECISION): min avg price when closing a long (selling),",
              "max avg price when closing a short (buying). 0 = none."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fundingRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "rate",
            "type": "i128"
          },
          {
            "name": "cumulative",
            "type": "i128"
          },
          {
            "name": "markTwap",
            "type": "u64"
          },
          {
            "name": "oracleTwap",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "initializeMarketParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "oracleSource",
            "type": {
              "defined": {
                "name": "oracleSource"
              }
            }
          },
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "pegMultiplier",
            "docs": [
              "Initial price in PEG_PRECISION (mark price at creation)."
            ],
            "type": "u128"
          },
          {
            "name": "ammReserve",
            "docs": [
              "Per-side virtual reserve depth (also sqrt_k): larger => less slippage."
            ],
            "type": "u128"
          },
          {
            "name": "marginRatioInitial",
            "type": "u32"
          },
          {
            "name": "marginRatioMaintenance",
            "type": "u32"
          },
          {
            "name": "maxLeverage",
            "type": "u32"
          },
          {
            "name": "minOrderBase",
            "type": "u64"
          },
          {
            "name": "maxOpenInterest",
            "type": "u128"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          },
          {
            "name": "fundingPeriod",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "initializeMockOracleParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "price",
            "docs": [
              "Initial price in PRICE_PRECISION (1e6)."
            ],
            "type": "u64"
          },
          {
            "name": "conf",
            "docs": [
              "Initial confidence in PRICE_PRECISION (1e6)."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "initializeStateParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "takerFeeBps",
            "type": "u16"
          },
          {
            "name": "makerRebateBps",
            "type": "u16"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "insuranceFund",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "totalShares",
            "docs": [
              "Total shares outstanding (for future LP staking; admin-seeded on devnet)."
            ],
            "type": "u128"
          },
          {
            "name": "totalDeposits",
            "docs": [
              "Total quote deposited, QUOTE_PRECISION."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "liquidationRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "baseClosed",
            "type": "u64"
          },
          {
            "name": "liqFee",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "oracle",
            "docs": [
              "Price account: a Pyth `PriceUpdateV2` (Pyth source) or a `MockOracle` (Mock source)."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracleSource",
            "docs": [
              "How to interpret `oracle`. Defaults to Pyth."
            ],
            "type": {
              "defined": {
                "name": "oracleSource"
              }
            }
          },
          {
            "name": "feedId",
            "docs": [
              "Expected Pyth feed id — verified against the price-update account on read (Pyth source)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "amm",
            "type": {
              "defined": {
                "name": "amm"
              }
            }
          },
          {
            "name": "marginRatioInitial",
            "docs": [
              "Initial / maintenance margin ratios, in `MARGIN_PRECISION` (1e4)."
            ],
            "type": "u32"
          },
          {
            "name": "marginRatioMaintenance",
            "type": "u32"
          },
          {
            "name": "maxLeverage",
            "docs": [
              "Convenience cap (margin ratios are the real constraint)."
            ],
            "type": "u32"
          },
          {
            "name": "minOrderBase",
            "docs": [
              "Minimum order size in base (BASE_PRECISION)."
            ],
            "type": "u64"
          },
          {
            "name": "openInterestLong",
            "type": "u128"
          },
          {
            "name": "openInterestShort",
            "type": "u128"
          },
          {
            "name": "maxOpenInterest",
            "type": "u128"
          },
          {
            "name": "nextFundingTs",
            "type": "i64"
          },
          {
            "name": "fundingPeriod",
            "type": "i64"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          },
          {
            "name": "name",
            "docs": [
              "Display name, e.g. \"SOL-PERP\" (null-padded)."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "initialized"
          },
          {
            "name": "active"
          },
          {
            "name": "reduceOnly"
          },
          {
            "name": "paused"
          }
        ]
      }
    },
    {
      "name": "mockOracle",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "authority",
            "docs": [
              "The only key allowed to push new prices."
            ],
            "type": "pubkey"
          },
          {
            "name": "price",
            "docs": [
              "Price in `PRICE_PRECISION` (1e6)."
            ],
            "type": "u64"
          },
          {
            "name": "conf",
            "docs": [
              "Confidence in `PRICE_PRECISION` (1e6)."
            ],
            "type": "u64"
          },
          {
            "name": "lastUpdateTs",
            "docs": [
              "Wall-clock of the last push — used for the same staleness guard as Pyth."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "openPositionParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "direction",
            "type": {
              "defined": {
                "name": "positionDirection"
              }
            }
          },
          {
            "name": "baseAmount",
            "docs": [
              "Order size, magnitude in BASE_PRECISION."
            ],
            "type": "u64"
          },
          {
            "name": "priceLimit",
            "docs": [
              "Slippage guard (PRICE_PRECISION): max avg price for a long, min for a short. 0 = none."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oracleSource",
      "docs": [
        "Where a market sources its index price."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pyth"
          },
          {
            "name": "mock"
          }
        ]
      }
    },
    {
      "name": "order",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderId",
            "type": "u32"
          },
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "orderType",
            "type": {
              "defined": {
                "name": "orderType"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "orderStatus"
              }
            }
          },
          {
            "name": "direction",
            "type": {
              "defined": {
                "name": "positionDirection"
              }
            }
          },
          {
            "name": "baseAssetAmount",
            "type": "u64"
          },
          {
            "name": "baseAssetAmountFilled",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "triggerPrice",
            "type": "u64"
          },
          {
            "name": "triggerCondition",
            "type": {
              "defined": {
                "name": "orderTriggerCondition"
              }
            }
          },
          {
            "name": "reduceOnly",
            "type": "bool"
          },
          {
            "name": "postOnly",
            "type": "bool"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "init"
          },
          {
            "name": "open"
          }
        ]
      }
    },
    {
      "name": "orderTriggerCondition",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "above"
          },
          {
            "name": "below"
          }
        ]
      }
    },
    {
      "name": "orderType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "market"
          },
          {
            "name": "limit"
          },
          {
            "name": "triggerMarket"
          },
          {
            "name": "triggerLimit"
          }
        ]
      }
    },
    {
      "name": "perpPosition",
      "docs": [
        "A position in a single market. `base_asset_amount` is signed: positive = long,",
        "negative = short. `quote_entry_amount` is the signed cost basis (negative when you",
        "paid quote to go long, positive when you received quote to go short) so that",
        "`uPnL = base_value + quote_entry_amount` — see `crate::math::pnl`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "baseAssetAmount",
            "type": "i64"
          },
          {
            "name": "quoteEntryAmount",
            "type": "i64"
          },
          {
            "name": "lastCumulativeFundingRate",
            "type": "i128"
          },
          {
            "name": "openOrders",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "placePerpOrderParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderType",
            "docs": [
              "`Limit` (resting maker), `TriggerMarket` / `TriggerLimit` (stop-loss / take-profit).",
              "`Market` is rejected here — market orders execute immediately via `open_position`."
            ],
            "type": {
              "defined": {
                "name": "orderType"
              }
            }
          },
          {
            "name": "direction",
            "type": {
              "defined": {
                "name": "positionDirection"
              }
            }
          },
          {
            "name": "baseAmount",
            "type": "u64"
          },
          {
            "name": "price",
            "docs": [
              "Limit price, PRICE_PRECISION (required for `Limit`/`TriggerLimit`; 0 for `TriggerMarket`)."
            ],
            "type": "u64"
          },
          {
            "name": "triggerPrice",
            "docs": [
              "Trigger price, PRICE_PRECISION (required for the trigger types; 0 otherwise)."
            ],
            "type": "u64"
          },
          {
            "name": "triggerCondition",
            "docs": [
              "Fire when the oracle is `Above` / `Below` `trigger_price`."
            ],
            "type": {
              "defined": {
                "name": "orderTriggerCondition"
              }
            }
          },
          {
            "name": "reduceOnly",
            "type": "bool"
          },
          {
            "name": "postOnly",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "positionDirection",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "long"
          },
          {
            "name": "short"
          }
        ]
      }
    },
    {
      "name": "state",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Admin authority (Squads multisig in production)."
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "docs": [
              "The single collateral asset (development USDC for capstone/devnet evaluation)."
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralVault",
            "docs": [
              "PDA token account holding all user collateral."
            ],
            "type": "pubkey"
          },
          {
            "name": "insuranceFundVault",
            "docs": [
              "PDA token account backing the insurance fund."
            ],
            "type": "pubkey"
          },
          {
            "name": "numMarkets",
            "type": "u16"
          },
          {
            "name": "numUsers",
            "type": "u32"
          },
          {
            "name": "takerFeeBps",
            "docs": [
              "Fees, in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "makerRebateBps",
            "type": "u16"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          },
          {
            "name": "maxOracleStalenessSeconds",
            "docs": [
              "Oracle guard rails."
            ],
            "type": "u64"
          },
          {
            "name": "maxOracleConfidenceBps",
            "type": "u64"
          },
          {
            "name": "paused",
            "docs": [
              "Emergency pause — blocks all user-facing position changes when true."
            ],
            "type": "bool"
          },
          {
            "name": "vaultAuthorityBump",
            "docs": [
              "Bump for the shared vault authority PDA (signs vault transfers out)."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "marketIndex",
            "type": "u16"
          },
          {
            "name": "isLong",
            "docs": [
              "Direction of the fill (true = long/buy base)."
            ],
            "type": "bool"
          },
          {
            "name": "isClose",
            "docs": [
              "Whether this reduced/closed a position (vs opened/increased)."
            ],
            "type": "bool"
          },
          {
            "name": "baseAmount",
            "type": "u64"
          },
          {
            "name": "quoteAmount",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "updateMarketArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "marginRatioInitial",
            "type": "u32"
          },
          {
            "name": "marginRatioMaintenance",
            "type": "u32"
          },
          {
            "name": "maxLeverage",
            "type": "u32"
          },
          {
            "name": "minOrderBase",
            "type": "u64"
          },
          {
            "name": "maxOpenInterest",
            "type": "u128"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          },
          {
            "name": "fundingPeriod",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "updateMockOracleParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "price",
            "docs": [
              "New price in PRICE_PRECISION (1e6)."
            ],
            "type": "u64"
          },
          {
            "name": "conf",
            "docs": [
              "New confidence in PRICE_PRECISION (1e6)."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "user",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "collateral",
            "docs": [
              "Deposited collateral, QUOTE_PRECISION (USDC, 1e6)."
            ],
            "type": "u64"
          },
          {
            "name": "cumulativeDeposits",
            "type": "i64"
          },
          {
            "name": "settledPnl",
            "type": "i64"
          },
          {
            "name": "nextOrderId",
            "type": "u32"
          },
          {
            "name": "beingLiquidated",
            "type": "bool"
          },
          {
            "name": "bankrupt",
            "type": "bool"
          },
          {
            "name": "badDebt",
            "docs": [
              "Unrecovered bad debt (QUOTE_PRECISION) awaiting `resolve_perp_bankruptcy`."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "positions",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "perpPosition"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "orders",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "order"
                  }
                },
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
