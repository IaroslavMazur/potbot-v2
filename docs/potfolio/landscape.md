# Where POTFolio sits

## The idea on crypto Twitter: Creator ETFs

On Dec 20, 2025 mert (Helius) wrote: "your fav CT person creates index fund of tokens, mints ETF shares → you buy if you think they're a good decision maker → finally know if a person is a sound investor or a LARP" (https://x.com/mert/status/2002394652993851679). The same day Akshay BD, ~170K impressions: "the real opportunity in creator coins is for them to be user generated ETFs: individuals who research, share a thesis and build a basket of assets against that and earn a fee on the AUM." The PotBot founder replied in that thread.

The objections in the replies, and what POTFolio does about them:

| Objection | POTFolio |
|---|---|
| Most CT creators are bad traders; 99% go to zero | The creator publishes a basket, not trades. Fixed weights; performance since launch is public from day one. |
| Counterparty risk: custody, bridging, infra | No custody: program-owned accounts, no withdraw instruction, exit in kind that cannot be paused. |
| It is copy-trading again | Copy-portfolio, not copy-trade: one token that mirrors a basket, no trade stream. |
| Symmetry, Reserve, Alvara, Indexify already exist | See the table below: none combine a plain SPL token in any wallet, an unpausable exit, keepers bounded by code, no-code creation and a fee split inside the deposit. |
| Who rebalances after a shock? | Permissionless keepers, bounded on-chain. |
| Legal liability of managing other people's money | The creator cannot touch the money. He is an author of a recipe, paid from inflows, not a manager. |


Baskets on Solana are not new. What is new in POTFolio is the combination: a basket that is a plain SPL token anyone can hold, an exit nobody can pause, keepers bounded by the program instead of by trust, and creation without code so communities and creators can launch their own.

| | What | Holdable token | Exit | Rebalancing | Creating | Creators earn |
|---|---|---|---|---|---|---|
| **PotBot POTFolio** | Basket as one SPL token, fixed weights, up to 5 assets | Yes, any wallet | In kind or USDC, never pausable, on-chain minimum | Anyone; bounded on-chain (toward target only, 25% of NAV cap, Pyth band, atomic open/close) | One transaction, no code | 0.30% entry split 40 creator / 40 referrer / 20 protocol, on-chain |
| Symmetry | Baskets and funds for builders, V3 mainnet beta | Yes | Via protocol liquidity | Protocol engine | SDK / UI | Manager fees |
| Cesto | Thematic baskets bought as a bundle (Frontier winner) | No, assets land in your wallet | Sell each asset | None | Curated | No |
| DiversiFi | Self-rebalancing vaults | Vault shares | Vault withdraw | Protocol keepers | Curated | No |
| GLAM | On-chain asset management for funds and managers | Fund shares | Manager-defined | Manager and integrations | Manager setup | Manager fees |
| Ondo Intelligent Portfolios | Model portfolios as one token, designed by BlackRock | Yes, eligible investors only | Issuer redemption | Issuer | Issuer only | No |

From public docs and product pages, October 2026. Corrections welcome: [@PotBot_sol](https://x.com/PotBot_sol).

## What each proves

- Symmetry: builders want baskets as tokens, and a basket engine can run on Solana at scale.
- Cesto: people want to buy a theme in one click; the Frontier jury rewarded that simplicity.
- DiversiFi: self-rebalancing is valued, and keepers are the hard part to make trustworthy.
- GLAM: professional managers want on-chain fund rails.
- Ondo: the biggest asset manager in the world now ships a portfolio as one token. Closed to most people.

## What POTFolio adds

- The token is the only ledger: no shares table, no issuer, hold it anywhere a token works.
- The exit path needs no oracle, no keeper and no permission, and cannot be paused. Exit to USDC adds an on-chain minimum.
- Keepers are permissionless but bounded by code: toward target only, capped per trade, inside the Pyth band, atomic.
- Creators and referrers are paid by the fee split inside the deposit instruction. Distribution is built in.
