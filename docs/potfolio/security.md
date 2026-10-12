# Security review: pot_index

Three passes. Oct 8 (initial program) and Oct 10 (after exit-to-USDC, deposit-and-allocate, cash-deploy cooldown change) against the Solana Foundation program-security checklist, the Oct 10 pass by a reviewer agent that had not seen the code being written. Oct 11: an independent human review of the whole program by Yaroslav (Solana engineer, draft audit, continuing). Result across all three: **no fund-draining path from an unprivileged account; no Critical or High findings.** Everything below is fixed in code unless marked accepted or v2.

## Oct 11 independent review: findings and what changed (Oct 12 upgrade)

| # | Severity | Finding | What changed |
|---|---|---|---|
| F1 | Medium | Oracle tick shopping. Pyth is a pull oracle: any historical signed update can be posted *now* (fresh `posted_slot`, old `publish_time`), so the Oct 10 `posted_slot` check (M1 below) does not close the window. The real window is `max_price_age_secs`, which was 300 s. | Live config set to **60 s** (devnet, Oct 12; 30 s was tried first and made the wallet prompt for a 7-transaction exit bundle too tight for a human); compiled cap `MAX_PRICE_AGE_SECS_LIMIT` lowered **300 → 60** so no admin can widen it again. Test `tick_shopping_is_bounded_by_price_age`: a 10%-lower tick published 45 s ago and posted now is refused; widening past the cap is refused. M1's `posted_slot` check stays as defence in depth, not as the mitigation. |
| F2 | Medium (trust) | `register_asset` binds any mint to any Pyth feed id with no on-chain check. An admin could register a worthless mint under BTC/USD; a Pot with that leg would value it at BTC's price and cash deploys would hand depositors' USDC to the keeper. New Pots only; existing legs copy `feed_id` at `add_leg`. | Not fixable in code without an on-chain feed registry. **Documented as a governance fact**: README and judges' page now say "not without a program upgrade or a malicious asset registration, both of which will sit behind a multisig". The allowlist is published (`assets.devnet.json`) so mint↔feed can be verified off-chain. `register_asset` goes behind the Squads multisig with a timelock before mainnet. |
| F3 | Medium (trust) | Upgrade authority is a single key; "no withdraw instruction" holds until the next upgrade. | Same: documented; Squads 2-of-3 + timelock on upgrade authority and admin before the first mainnet deposit; verified build on Explorer. |
| F4 | Low (ops) | `init_config` is callable by whoever is first. | Deploy checklist: deploy and `init_config` in one transaction on mainnet. (Devnet config already initialised by us.) |
| F5 | Low | `config.usdc_mint` could be registered as an asset; a USDC leg would share the cash vault and be counted twice in NAV and exit. | `register_asset` refuses the cash mint (`InvalidLeg`). Test `usdc_cannot_be_a_leg`. |
| F6 | Low (economic) | The slippage band is a floor that a third-party keeper takes in full; deposit and cash deploy are separate transactions, so on mainnet a bot can deploy fresh cash first at the floor; the 0.5% deadband is a tight global constant. | Now: front-end default `slippage_bps` **100 → 50**. v2 of the program: cash deploy in the same transaction as the deposit (v1 transactions), rotations as a Dutch auction (allowed slippage starts at 0 and grows per slot, so keepers compete the band down), per-Pot deadband. Documented in keepers.md. |
| F7 | Info | `exit` deserialised each leg's user ATA before checking the leg pays 0, so a holder without an ATA for an undeployed leg could not exit. | Check `out == 0` first in `exit` and `exit_usdc_open`. Test `exit_pays_cash_without_leg_atas`. |
| F8 | Low (design) | A freeze on any leg vault (freezable mint on the allowlist) blocks every exit. | Policy: allowlist policy per asset, documented per listing; "skip frozen leg" exit path is a v2 design item. |
| F10 | Info | No account-substitution negative tests. | Added: foreign vault in `remaining_accounts` (`VaultMismatch`), foreign user ATA on exit (`TokenOwnerMismatch`), non-creator `finalize_pot`, non-admin `register_asset`. 12/12. |
| F11 | Doc | security.md claimed M1 fixed; README "not PotBot" was unconditional; keepers.md said keepers "compete on price"; the pivot from the original spec was unrecorded. | All four corrected (this file, README, keepers.md, overview.md). |
| F13 | Info (economic) | The 0.10% exit-to-USDC conversion fee is avoidable: any front end can call `exit` and append swaps. | Accepted and stated in fees-and-economics.md: it is an interface fee, not a protocol fee; revenue projections count only entry and in-Pot exit fees. |
| F14 | Low (ops) | Token metadata URIs pointed at a Vercel preview deployment, with no update instruction. | New creator-only `update_index_metadata(uri)`; showcase Pots repointed to `potbot.fun`; new Pots use the canonical origin. Token-2022 metadata before mainnet. |

Not changed on purpose: the monotonic-per-Pot publish time (needs a Pot field, v2 migration), F6 items 1, 3, 4 (same migration), Token-2022 (mainnet).

## Oct 10 findings and what changed

| # | Severity | Finding | Fix |
|---|---|---|---|
| M1 | Medium | A caller could pick the most favourable Pyth tick of the last `max_price_age_secs` (300 s) by posting an older VAA: deposit at a low NAV, or rebalance at a flattering price. | Oct 10: `posted_slot` must be within 150 slots. **Oct 11 review (F1) showed this does not close the window**, since an old tick can be posted now. Oct 12: window set to 30 s, cap 60 s. See F1 above. |
| M2 | Medium | Cash deployment (buying a fresh deposit into the basket) is permissionless and, since Oct 10, uncooled; a keeper's margin was slippage band + Pyth confidence on every deposited dollar. | Cash deploys are now priced at the **mid price** (`price`, not `price − conf`): the keeper's margin is the slippage band alone. Asset→asset rotations keep the conservative `price − conf`. |
| L1 | Low | Cash deploys reset `last_rebalance_slot`, so tiny fair-value deploys could keep rotations blocked forever. | Cash deploys no longer touch `last_rebalance_slot`. Test asserts it. |
| L2 | Low | The holder's own `min_usdc_out` on exit-to-USDC was checked against the pre-trade floor, not the actual proceeds. | `exit_usdc_close` enforces `max(Pot floor, holder floor)`. Test: a floor above the sale reverts the whole transaction, tokens stay with the holder. |
| L3 | Low | Conversion fee is charged on the floor, not actual proceeds, and avoidable by exiting in kind and swapping yourself. | Accepted: the fee pays for the one-click path; in-kind exit stays free of it by design. |
| I1 | Info | `total_exits_usd` can be inflated by self-transferring USDC between open and close. | Accepted; it is a display counter, not used in any decision. |
| I2 | Info | Some u128 arithmetic relies on `overflow-checks = true` rather than `checked_*`. | Accepted for the Fair; a panic is a failed transaction. Will be normalised before audit. |
| I3 | Info | Index mint had `freeze_authority = pot`. | Removed: new index mints have **no freeze authority**. (The five showcase mints keep theirs; the program has no freeze instruction.) |
| I4 | Info | `rebalance_open` / `exit_usdc_open` used the strict `!open` check while deposit/exit used the self-healing same-slot form. | All four now use the same-slot form, so a window can never brick a Pot. |
| I5 | Info | A depositor can self-refer from a second wallet (recovers 0.12% of their own deposit). | Accepted; registered referrers planned. |

## Adversarial scenarios that pass (Oct 10)

- Exit to USDC cannot pay more than a plain in-kind exit: the Pot's outflow is the same `exit_amount` math; the minimum only protects the holder. `in_vault_before` is the balance after the cash transfer, so only the sale counts. Wrong-owner or wrong-mint holder accounts are rejected. `close` is bound to the same user, Pot and USDC account through instruction introspection; double close, a stale window, `rebalance_close` against an exit window and `exit_usdc_open` inside a rebalance window are all refused. CPI entry is blocked on all four window instructions.
- Griefing: vaults are PDA-owned and unclosable; creator/treasury USDC ATAs are recreatable by anyone; pauses never touch `exit`; donations to vaults only benefit holders.
- Repeated bounded trades: cash can never be bought back, in-leg cannot exceed target, out-leg cannot drop below target, trade ≤ 25% of NAV; total leakage is bounded by the per-dollar margin in M2, not by repetition.
- Crafted Pyth accounts: owner, discriminator, `VerificationLevel::Full`, feed id, age, posted slot, confidence ≤ 2%, `price − conf > 0` all checked.
- Fee math: floors in favour of the Pot, split sums exactly, 1 USDC minimum prevents zero fees, creator/referrer/treasury duplicate-account cases handled and tested.
- First-depositor inflation: virtual 1 token / $1 offset, 6-decimal shares, `shares > 0`.

## Oct 8 findings (all fixed in code)

Oracle age cap + conservative confidence pricing (H1), rebalance deadband/cooldown and 1% max slippage (M1), two-step admin transfer and USDC-decimals check (M2), exit safety valve against a stale rebalance flag (L1), `init_if_needed` ATAs against pre-creation griefing (L2), 1 USDC minimum deposit (L5).

## Test coverage (LiteSVM, `./test.sh`, 12 tests)

Review tests (Oct 12): tick shopping bounded by price age and cap; USDC cannot be a leg; exit pays cash without leg ATAs; substituted vault and user ATA refused; creator and admin instructions gated. Full flow create → deposit (fee split) → bounded rebalance (missing close, oversized trade, under-delivery revert, honest fill, cooldown) → deposit at NAV → in-kind exit → pause. Overshoot bounds. Stale price blocks deposit but not exit. Weights must sum; admin-only config. Exit to USDC: missing close, close bound to another USDC account, under-delivery revert, honest fill with exact fee, holder floor enforced, double close, cross-window close. Cash deploys without cooldown, rotation cooldown untouched. Referral: exact 0.12/0.12/0.06 split, self-referral rejected, referrer = creator, no referrer, wrong-mint referrer account.

## Before mainnet

Third-party audit; upgrade authority, protocol admin and `register_asset` on a Squads 2-of-3 with a timelock (F2, F3); deploy + `init_config` in one transaction (F4); verified build; Token-2022 metadata (F14); program v2 items from F6; capped flagship Pot. Then the published allowlist with mint↔feed pairs so anyone can verify what the admin registered.
