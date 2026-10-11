# Keepers

A keeper is any bot that moves a Pot toward its target weights. The program, not the keeper, sets the rules.

## What a keeper does
1. Reads the Pot, prices every leg (Pyth Hermes), computes current vs target weights.
2. Picks the most overweight leg (cash counts as overweight whenever it is non-zero) and the most underweight leg.
3. Sends one transaction: post Pyth updates -> `rebalance_open(leg_out, leg_in, amount_out)` -> swap -> `rebalance_close` -> close Pyth accounts.

## What the program enforces
- Only overweight -> underweight, never past target on either side (`NotOverweight`, `OvershootOut`, `OvershootIn`).
- At most 25% of NAV per transaction (`TradeTooLarge`), 0.5% deadband, 150-slot cooldown (rotations only; cash deploys have no cooldown).
- The in-vault must receive at least Pyth value x (1 - slippage_bps), slippage capped at 1% (`RebalanceSlippage`).
- `open` without a `close` later in the same transaction fails (`MissingClose`); CPI is refused (`CpiNotAllowed`).

## Devnet keeper
`apps/web/scripts/pot-index-devnet-keeper.ts`: serves every showcase Pot from `assets.devnet.json`, `--loop 300` to run continuously, `--dry` to print the plan. The "swap" on devnet is an SPL transfer from the keeper's test inventory (minted by the init script) at the Hermes mid price. Keeper keypair: `POT_INDEX_KEEPER_KEYPAIR` (defaults to the admin key).

## What the band really is (Oct 11 review, F6)
`rebalance_close` checks only `received >= min_in`, so the slippage band is a **floor**, not a target. A third-party keeper can route the swap to its own wallet and forward exactly the minimum: the Pot then pays the whole band on every rotation, and keepers compete on latency (priority fees), not on price. A depositor acting as keeper has no reason to do that (Jupiter delivers straight into the vault and `close` measures the vault delta), which is why deposit-and-allocate makes the depositor the keeper. Today the front-end default band is 0.5% (0.3% is enough for blue-chip baskets, 1% for memes).

Program v2 changes this: (1) the cash deploy happens in the same transaction as the deposit, so there is nothing for a bot to front-run; (2) asset→asset rotations become a Dutch auction: allowed slippage starts at 0 when drift crosses the deadband and grows per slot, so keepers compete the band down to the real cost of the swap; (3) the deadband becomes a per-Pot parameter with a wider default. Exit is never gated by any of this.

## Mainnet keeper
Same instruction pair; the swap step becomes a Jupiter route. Anyone can run one. Partner rebalancing engines (for example DiversiFi) can fill the same instruction.
