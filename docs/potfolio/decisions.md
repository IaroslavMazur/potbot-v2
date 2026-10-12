# Technical decisions

Decisions about `pot_index` that are not obvious from the code, with the reason and what they cost. Review findings are numbered as in [security.md](security.md) (F1 to F14). Add a decision here whenever a change trades one property for another.

## Deployment and account layouts

**1. v1.2 goes to a new program address; v1.1 stays live as a backup.** (Oct 12)
Devnet has no real users, so v1.2 is deployed now instead of after a migration period, but to a fresh address: `DfKKe9oiPb8E98qxZ95otU3D5y1L1U3L2Eh3A7HQiUxr` keeps running the build that was judged, with its Pots and funds, and nothing has to be migrated. An in-place upgrade remains possible (see [operations.md](operations.md)), at the cost of every existing Pot.

**2. Before mainnet, account layouts may change without supporting old accounts.**
`Pot.total_exits_usd` was removed outright (decision 13), which makes v1.1 Pots unreadable by v1.2. That is acceptable on devnet only. From mainnet on, fields are only appended, and every layout change ships with a migration instruction, as `migrate_config` does for `Config`.

**3. `Config.pending_admin_expiry_slot` is appended after `bump`, with a one-off `migrate_config`.**
Appending keeps every old field at its offset, so a v1.1 `Config` grows in place and the new field reads 0 (no proposal pending). `migrate_config` checks owner, discriminator, old size and admin, and tops up rent. It exists only for the in-place path and should be deleted once no deployment needs it.

**4. Error codes are renamed in place and new ones appended, never reordered.**
Anchor numbers errors by position (6000 + index), and clients match on the number. `PriceAgeTooLong` became `PriceAgeOutOfRange` and `BadUsdcDecimals` became `BadUsdcMint` at the same codes (6043, 6044); new errors start at 6046.

## Admin and configuration

**5. `init_config` can only be called by the program's upgrade authority (F4).**
The first caller of `init_config` becomes admin and picks the cash mint. The earlier plan, deploy and init in one transaction, cannot work: the runtime makes a program callable only from the slot after its deployment. Checking the upgrade authority in `ProgramData` closes the window at any time.

**6. The USDC mint is fixed at build time, per cluster.**
`USDC_MINT` is mainnet USDC with `--features mainnet` and the devnet test USDC otherwise; `init_config` accepts no other mint. A runtime check (the old `decimals == 6`) only catches honest mistakes, not a look-alike mint. A default build fails `init_config` on mainnet instead of accepting the wrong mint.

**7. Admin transfer is two-step, with a one-hour expiry.**
`set_config(new_admin)` proposes; the new key must sign `accept_admin`, which proves the address can sign before it gets any power (a typo, a PDA or a Squads multisig account instead of its vault cannot become admin). The check is an account constraint, `pending_admin == new_admin`, with no separate "is a transfer pending" test: an empty `pending_admin` is the default key, which nobody can sign for. A proposal expires after `PENDING_ADMIN_TTL_SLOTS` (9,000 slots, about an hour), so a forgotten proposal cannot be accepted months later by whoever holds that key by then. Proposing the default key cancels. With a Squads admin, the multisig has to execute `accept_admin` inside the hour, or propose again.

**8. `set_config` must change something, and every admin action emits an event.**
An update that changes nothing (empty, or the value already set) fails with `NothingToUpdate`, so on an explorer a successful `set_config` always is a configuration change. `ConfigUpdated`, `AdminAccepted`, `AssetRegistered` and `AssetUpdated` make the admin's history readable without diffing account state.

**9. The price window is 1 to 60 s in code, 30 s recommended live (F1).**
Pyth is a pull oracle: anyone can post any signed update that is still inside the window, so the window is how far back a depositor can pick a favourable price. One helper validates the bound for `init_config` and `set_config`. The live value was raised to 60 s because a human signing several transactions was too slow; since the operator refreshes prices right before it submits, signing time no longer counts against the window, and 30 s costs nothing.

## Asset allowlist

**10. `enabled` is a flag, not the account's existence.**
Closing the `AssetConfig` to disable an asset would save one check, but re-enabling would then mean registering again with a feed id supplied afresh, which is the path an admin could abuse (F2). The flag restores the vetted mint and feed as they were, keeps disabled assets visible on-chain, and gives a specific error (`AssetDisabled`).

**11. Legs keep a snapshot of the feed id; `update_asset` changes it for new legs only.**
Reading the feed live from `AssetConfig` would let one admin change reprice every existing Pot at once, extending F2 from new Pots to all of them, and would add an account per leg to every priced instruction. The snapshot keeps the admin's reach to Pots created after a change. If Pyth retires a feed, the Pots using it stop taking deposits and rebalancing (prices go stale and the program refuses them), but in-kind exit needs no price, so holders can always leave. `set_asset_enabled` became `update_asset({ enabled, feed_id })`.

**12. Registering or repointing a feed requires a live price for it.**
`register_asset` and a feed change in `update_asset` read a fresh `PriceUpdateV2` for the feed. A mistyped or unentitled feed would otherwise surface only at the first deposit, after a creator may have finalized a Pot whose legs cannot change. This proves the feed exists, not that it prices this mint: nothing on-chain links a mint to a Pyth feed, so F2 stays a governance item.

**13. Mints with a freeze authority cannot be listed (F8).**
Exits pay every leg, so a single frozen leg vault would block every exit, and exit is the one path that must never fail. v1 therefore lists only assets nobody can freeze, which rules out regulated tokens (tokenized stocks, most fiat stablecoins). Those belong in a separate product whose exit pays the unfrozen legs and keeps a frozen leg's share claimable until it is unfrozen.

**14. Legs are classic SPL tokens only.**
Every leg CPI uses the classic token program, and vaults are checked against it. Token-2022 legs would need per-leg token programs and an allowlist of extensions (transfer hooks, permanent delegates, pausable mints and transfer fees all break the exit or valuation assumptions). Not planned for v1.

## Exits and statistics

**15. Exits are never paused and never read the oracle.**
The admin can pause deposits and rebalances, a creator can pause deposits, but nobody can stop an exit: the power to stop exits is the power to trap funds.

**16. The last holder pays no exit fee.**
The 0.50% exit fee stays in the Pot for the holders who remain. When the whole supply is burned, nobody remains: the fee would be stranded in a Pot with no tokens and taken by whoever deposits next (the same holder, or a bot watching for it). `exit_amount` therefore returns the whole balance when `shares == supply`.

**17. `total_exits_usd` was removed.**
Holders choose how much leaves in kind and how much as USDC, and legs paid in kind carry no price on the exit path, so the counter recorded only the USDC part of exits and said little about what left a Pot. Valuing in-kind exits would mean an oracle read on the one path designed to need none. `total_deposits_usd` stays: deposits are always USDC, so it is exact.

**18. The 0.10% conversion fee is an interface fee (F13).**
Any front end can call `exit` and swap the legs itself without it. Revenue projections count only the entry fee and the in-Pot exit fee.
