# Brand — impl.trade

_Status: active_

A dark, dense, exchange-grade perps DEX UI. Think Phoenix/Drift/Hyperliquid: calm near-black
surfaces, monospace numbers, one sharp accent, and the universal long/short green/red.

## Palette (dark, default)

| Token | Hex | Use |
|---|---|---|
| `background` | `#0B0E11` | app background |
| `surface` | `#141A1F` | panels / cards |
| `surface-2` | `#1A222B` | raised rows, inputs, hover |
| `border` | `#232B33` | hairline dividers |
| `foreground` | `#E6EDF3` | primary text |
| `muted` | `#8B98A5` | secondary text / labels |
| `primary` | `#2DD4BF` | brand accent (teal), focus rings, CTAs |
| `long` | `#16C784` | longs / bids / price up |
| `short` | `#F6465D` | shorts / asks / price down |

Contrast: `foreground` on `background` ≈ 14:1, `muted` on `background` ≈ 5.3:1 — both pass AA.

## Typography

- **UI:** Inter (`--font-sans`).
- **Numbers / prices / sizes / addresses:** JetBrains Mono (`--font-mono`) with tabular figures,
  so columns of numbers align and don't jitter on update.

## Voice

Terse, precise, trader-native. "No open positions." "Insufficient collateral." "Long 1.0 SOL @ $100.10."
No marketing fluff, no exclamation points.
