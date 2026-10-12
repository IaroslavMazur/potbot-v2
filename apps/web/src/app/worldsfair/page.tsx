import type { Metadata } from 'next'
import Link from 'next/link'
import { POT_INDEX_SETTINGS } from '@/lib/pot-index/registry'
import { HowAPotWorks } from '@/components/pot-index/HowAPotWorks'
import { LivePots } from '@/components/pot-index/LivePots'
import { PageHeader } from '@/components/PageHeader'

export const metadata: Metadata = {
  title: 'PotBot POTFolio × Crypto World\'s Fair',
  description:
    'PotBot POTFolio: a basket of Solana assets (crypto, Solana natives, tokenized stocks, memes) as one liquid index token. Built for Colosseum Crypto World\'s Fair, Sept 14 – Oct 12, 2026.',
}

const PROGRAM = POT_INDEX_SETTINGS.programId
const explorer = `https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`

export default function WorldsFairPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <PageHeader
        eyebrow="Colosseum · Crypto World's Fair · Solana"
        title={<>PotBot <span className="text-pot-green">POTFolio</span></>}
        lede="Any basket of Solana assets as one liquid token. Create a portfolio, hold the token."
        className="mb-6"
      />

      {/* The whole submission in 30 seconds. Everything below is the long version. */}
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-pot-accent">In 30 seconds</p>
        <dl className="mt-4 grid gap-4 text-[15px] leading-relaxed sm:grid-cols-[140px_1fr]">
          <dt className="font-semibold text-white">What</dt>
          <dd className="text-pot-muted">A creator picks up to 5 Solana assets and their weights; the program issues one SPL token that mirrors the whole basket. Deposit USDC to mint it at NAV, redeem it any time for every asset inside or for USDC.</dd>
          <dt className="font-semibold text-white">For whom</dt>
          <dd className="text-pot-muted">A new user holds one token instead of ten and never rebalances. A creator publishes a thesis and earns on every deposit without holding anyone&apos;s money. An advanced user gets a token that composes with DeFi.</dd>
          <dt className="font-semibold text-white">Why trust it</dt>
          <dd className="text-pot-muted">Assets sit in program-owned accounts with no withdraw instruction. Exit in kind needs no oracle and cannot be paused. Keepers are bounded by code. Three security reviews, every finding published.</dd>
          <dt className="font-semibold text-white">Why now</dt>
          <dd className="text-pot-muted">Crypto Twitter asked for Creator ETFs in December 2025; Ondo and BlackRock shipped a closed version in September 2026; USDC lands in 82M Samsung wallets this month. POTFolio is the open one.</dd>
          <dt className="font-semibold text-white">Live today</dt>
          <dd className="text-pot-muted">Program on Solana devnet since Oct 8, five POTFolios, deposit buys the basket in one wallet prompt, exit to assets or USDC, price history and P&amp;L per wallet. Third PotBot hackathon: Telegram group trading, then governed vaults, now the token.</dd>
        </dl>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href="/portfolios/PotSvA4ynuxbMFUA8SJSbULHhuTY1JcL5RaxnQz5FmM" className="btn-primary text-center">Try it (2 minutes)</Link>
          <a href="https://github.com/YD811/potbot-v2" target="_blank" rel="noreferrer" className="btn-secondary text-center">Source on GitHub</a>
          <a href={explorer} target="_blank" rel="noreferrer" className="btn-secondary text-center">Program on Explorer</a>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['17', 'program instructions'],
          ['12 / 12', 'end-to-end tests'],
          ['3', 'security reviews'],
          ['0', 'failed transactions'],
        ].map(([v, l]) => (
          <div key={l} className="card p-4 text-center">
            <p className="text-2xl font-black text-white">{v}</p>
            <p className="mt-1 text-xs text-pot-muted">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-pot-muted">Every section below opens for the long version: the idea and its sources, the mechanics, the reviews, the limits.</p>

      <Section title="Try it in two minutes" summary="Get test USDC, deposit 100, redeem for assets or USDC. Real devnet transactions." open>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open <Link href="/portfolios/PotSvA4ynuxbMFUA8SJSbULHhuTY1JcL5RaxnQz5FmM" className="text-pot-green underline">Solana Blue Chips</Link>. Connect a wallet in devnet mode, or sign in with email (a wallet is created for you).</li>
          <li>Click <b className="text-white">Get test USDC</b>: 1,000 test USDC and a little SOL for fees land in the wallet.</li>
          <li><b className="text-white">Deposit 100</b>. One wallet prompt: Pyth prices are posted, your tokens are minted at NAV, and the basket is bought leg by leg. The activity feed shows every transaction.</li>
          <li><b className="text-white">Redeem</b>: move the slider, choose <i>Get the assets</i> (every asset in kind) or <i>Get USDC</i> (sold in the same transaction with an on-chain minimum). Your position card shows cost basis and P&amp;L.</li>
          <li>Optional: <Link href="/portfolios/new" className="text-pot-green underline">create your own POTFolio</Link> in one transaction and open it through your referral link from a second wallet.</li>
        </ol>
        <p className="text-xs">Everything above is a real devnet transaction on program <code className="break-all">{PROGRAM}</code>. Test tokens, live Pyth prices.</p>
      </Section>

      <Section title="Creator ETFs, as crypto Twitter asked for" summary="mert and Akshay BD, Dec 20 2025, and what POTFolio changes: the creator cannot touch the money.">
        <p>
          On Dec 20, 2025 mert (Helius) wrote: <i>&ldquo;your fav CT person creates index fund of tokens, mints ETF shares, you buy if you
          think they&apos;re a good decision maker, finally know if a person is a sound investor or a LARP.&rdquo;</i> The same day Akshay BD
          (170K impressions): <i>&ldquo;the real opportunity in creator coins is for them to be user generated ETFs: individuals who research,
          share a thesis and build a basket of assets against that and earn a fee on the AUM.&rdquo;</i> The PotBot founder replied in that
          thread. mert asked whether anyone had traction.
        </p>
        <p>
          POTFolio is that product, with one change that answers the objections in those threads: the creator publishes the basket and
          earns on every deposit, but cannot touch the money. No custody, no discretion, no manager liability. Five baskets live on
          devnet, every deposit and exit on Explorer: that is the traction.
        </p>
        <p className="text-xs">
          Sources: <a className="text-pot-green underline" href="https://x.com/mert/status/2002394652993851679" target="_blank" rel="noreferrer">mert, Dec 20 2025</a>. The
          full research, objections and answers: <a className="text-pot-green underline" href="https://github.com/YD811/potbot-v2/blob/main/docs/potfolio/landscape.md" target="_blank" rel="noreferrer">docs/potfolio/landscape.md</a>.
        </p>
      </Section>

      <Section title="Three hackathons, one idea" summary="Telegram group trading, then governed vaults, now a token anyone can hold.">
        <ol className="space-y-3">
          <li>
            <b className="text-white">Hackathon 1: group trading.</b> Our first Colosseum entry came from a real request: friends in a
            Telegram group wanted to trade together from one wallet. We built PotBot v1: a shared pot, votes on trades, one treasury for
            the group.
          </li>
          <li>
            <b className="text-white">Hackathon 2: the vault.</b> At Frontier we found the shape that works better: a non-custodial
            vault with strategies, where capital sits in program-owned accounts and the group governs it.
          </li>
          <li>
            <b className="text-white">Hackathon 3: the token.</b> This time we wrapped the vault into a single liquid token. A POTFolio
            is a basket you can hold in your wallet, send to a friend, sell on a DEX or post as collateral, and redeem any time for
            every asset inside or for USDC. That makes PotBot a launchpad for portfolios, and it is what we keep building after the Fair.
          </li>
        </ol>
      </Section>

      <Section title="What a POTFolio is, in plain words" summary="One token, a slice of the basket. No exit liquidity games. Nobody can withdraw. Creators earn.">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>One token = a slice of the whole basket.</b> Deposit USDC, the Pot mints tokens at the current value of the basket
            (NAV). The basket grows or falls with its assets, the token follows.
          </li>
          <li>
            <b>No exit liquidity games.</b> Leaving means redeeming your tokens for your pro-rata share of every asset, in kind, or
            for USDC in one transaction with a minimum the program enforces. Nothing depends on a market maker, nobody is left holding
            the bag, and 0.5% of what leaves stays in the Pot for the holders who remain.
          </li>
          <li>
            <b>Nobody can withdraw.</b> Assets sit in accounts owned by the program (PDAs): no private key, no withdraw
            instruction. Not the creator, not PotBot.
          </li>
          <li>
            <b>Keepers buy the basket, the program sets the limits.</b> Keepers are independent bots (ours, partners, or your own). A keeper may only move the basket toward its target weights,
            never past them, never more than 25% of the Pot per trade, and only at a price inside the Pyth band. If the keeper delivers
            less than promised, the whole transaction is reverted.
          </li>
          <li>
            <b>Creators earn.</b> 0.30% on every deposit is split on-chain: 40% creator, 40% referrer, 20% protocol. Share your link,
            build your basket&apos;s community.
          </li>
        </ul>
      </Section>

      <Section title="Live on devnet now" summary="Five POTFolios with live Pyth prices and test tokens.">
        <LivePots />
        <p className="mt-4 text-xs">
          Test tokens, real prices. Stock POTFolios mint only while US markets are open: the program refuses stale prices, exits work
          always. Free Pyth tier limits devnet assets to majors; the paid tier adds the long tail (JUP, BONK, NVDA…) by config.
        </p>
      </Section>

      <Section title="How it works" summary="Invest or create: the four moves.">
        <HowAPotWorks compact />
      </Section>

      <Section title="Where it sits" summary="Symmetry, Cesto, DiversiFi, GLAM, Ondo: what each does and what POTFolio adds.">
        <p>
          Baskets on Solana are not new. What is new is a basket that is a token anyone can hold, with an exit nobody can pause and
          keepers bounded by code instead of trust.
        </p>
        <CompetitorTable />
        <p className="text-xs">
          From public docs and product pages, Oct 2026. Corrections welcome at{' '}
          <a className="text-pot-green underline" href="https://x.com/PotBot_sol" target="_blank" rel="noreferrer">@PotBot_sol</a>.
        </p>
      </Section>

      <Section title="Why now" summary="Every asset class is moving onto one chain; the open layer on top is missing.">
        <p>
          On Sept 24, 2026 Ondo launched Intelligent Portfolios &ldquo;Powered by BlackRock&rdquo;: a whole model portfolio as one onchain
          token, rebalanced programmatically, designed by BlackRock and open to eligible investors only. The same month Metaplex shipped
          MPL-3643 for permissioned RWAs and named Meteora its liquidity partner; xStocks put Tesla and the Nasdaq-100 on Solana as plain
          SPL tokens. The industry is moving every asset class onto one chain. PotBot is the open layer on top: creators build the
          portfolio, communities hold the token, and the token works across DeFi.
        </p>
      </Section>

      <Section title="Built during the Fair (Sept 14 to Oct 12)" summary="The program, the mechanics, the tests and three reviews, in detail.">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>New Anchor 1.2 program <code>pot_index</code></b>, 17 instructions, written from scratch in its own workspace. Devnet
            program id <code className="break-all text-pot-green">{PROGRAM}</code>, live since Oct 8, upgraded Oct 10 and Oct 12 after reviews.
          </li>
          <li>
            <b>Single-ledger accounting:</b> the SPL index token supply is the only record of ownership. Mint on deposit at Pyth-priced
            NAV (prices posted in the same transaction, max 30 s old with a 60 s cap in code, priced conservatively at price ± confidence), burn on exit.
            Metaplex token metadata attached by the program, so the token has a name and logo in every wallet.
          </li>
          <li>
            <b>Atomic bounded rebalancing:</b> <code>rebalance_open</code> reads the transaction (Instructions sysvar) and refuses unless a
            matching <code>rebalance_close</code> follows; under-delivery reverts everything. Deadband, cooldown, per-trade cap, slippage band.
          </li>
          <li>
            <b>Exit in kind, never pausable, or exit to USDC in one transaction:</b> <code>exit_usdc_open</code> pays the cash share and
            hands the legs to the holder, the legs are sold inside the same transaction, <code>exit_usdc_close</code> checks the holder
            received at least the Pyth-priced minimum and takes a 0.10% conversion fee. Referral economics on-chain; the creator can
            only pause deposits or cap size.
          </li>
          <li>
            <b>Deposit and allocate in one prompt:</b> after the deposit, the holder acts as keeper and buys the basket leg by leg
            inside the same wallet approval. Cash deployments have no cooldown and are priced at mid.
          </li>
          <li>
            <b>Five live POTFolios</b> across crypto majors, Solana natives, tokenized stocks and memes; keeper running; faucet with
            test USDC and SOL; index price history, cost basis and P&amp;L per wallet; Garden mode (every Pot grows a plant with its NAV).
          </li>
          <li>
            <b>Tests &amp; three reviews:</b> LiteSVM end-to-end suite, 12 tests (fee split and referral paths, bounded rebalance incl.
            missing-close / overshoot / under-delivery reverts, exit to USDC incl. holder minimum and double close, cash deploy without
            cooldown, oracle window and tick shopping, account substitution, gated instructions). Reviews on Oct 8 and Oct 10 against the
            Solana Foundation checklist, and on Oct 11 an independent human review by a Solana engineer: no fund-draining path, no
            criticals or highs. The Oct 11 review showed our Oct 10 oracle fix was not one (a pull oracle accepts old ticks posted now);
            we shrank the window to 30 s with a 60 s cap in code, added the test, and published every finding, including the two trust
            points (program upgrades, asset registration) that go behind a multisig before mainnet.{' '}
            <a className="text-pot-green underline" href="https://github.com/YD811/potbot-v2/blob/main/docs/potfolio/security.md" target="_blank" rel="noreferrer">Full report</a>
          </li>
        </ul>
      </Section>

      <Section title="Honest limits and what comes next" summary="Devnet, fixed weights, 5 assets, the keeper band; what changes in program v2 and on mainnet.">
        <ul className="list-disc space-y-2 pl-5">
          <li>Up to 5 assets per Pot today, 10 next (deposit transactions split across price updates).</li>
          <li>Devnet sells and buys go through a test market maker; on mainnet the same two instructions wrap Jupiter swaps signed by the holder alone.</li>
          <li>Fixed weights now. Next: Managed POTFolios (creator adjusts within a public mandate and a timelock) and Community POTFolios (holders vote with the token).</li>
          <li>Keeper economics, program v2: cash deploy in the same transaction as the deposit (v1 transactions), asset rotations as a Dutch auction so keepers compete the slippage band down, per-Pot deadband. The current band is a floor a third-party keeper can take in full; we say so in the docs instead of pretending otherwise.</li>
          <li>Secondary market: a $POT/USDC pool on Meteora so tokens trade on Jupiter, Photon and in wallets; minting and burning at NAV keep the pool honest.</li>
          <li>Long-tail assets via paid Pyth or Switchboard; permissioned stocks via MPL-3643; &ldquo;Launch with a floor&rdquo;, bonding-curve launches backed by a Pot.</li>
          <li>Guarded mainnet after the Fair: flagship Pot with a cap, upgrade authority on a Squads multisig, Jupiter keeper.</li>
        </ul>
        <p>
          Full roadmap on <Link href="/roadmap" className="text-pot-green underline">/roadmap</Link>, mainnet plan on{' '}
          <Link href="/mainnet" className="text-pot-green underline">/mainnet</Link>.
        </p>
      </Section>

      <Section title="Team" summary="Yehor (YD), Amsterdam: Binance and Trust Wallet BD, Y-DAO, Superteam NL.">
        <p>
          Yehor (YD), founder. 10 years in crypto, BD at Binance and Trust Wallet, runs Y-DAO Amsterdam and helped set up Superteam
          Netherlands. Previous Colosseum hackathons: local track wins. Builds with AI engineering (Claude Code), reviews with Colosseum
          Copilot and Solana Foundation skills.{' '}
          <a className="text-pot-green underline" href="https://x.com/PotBot_sol" target="_blank" rel="noreferrer">@PotBot_sol</a> ·{' '}
          <a className="text-pot-green underline" href="https://x.com/CryptoYDao" target="_blank" rel="noreferrer">@CryptoYDao</a>
        </p>
      </Section>
    </div>
  )
}

const ROWS: { name: string; what: string; token: string; exit: string; keepers: string; create: string; earn: string }[] = [
  {
    name: 'PotBot POTFolio',
    what: 'Basket as one SPL token, fixed weights, up to 5 assets',
    token: 'Yes, any wallet',
    exit: 'In kind or USDC, never pausable, on-chain minimum',
    keepers: 'Anyone; bounded on-chain (toward target, 25% cap, Pyth band, atomic)',
    create: 'One transaction, no code',
    earn: '0.30% entry split 40 / 40 / 20 on-chain',
  },
  {
    name: 'Symmetry',
    what: 'Baskets and funds for builders, V3 mainnet beta',
    token: 'Yes',
    exit: 'Via protocol liquidity',
    keepers: 'Protocol engine',
    create: 'SDK / UI',
    earn: 'Manager fees',
  },
  {
    name: 'Cesto',
    what: 'Thematic baskets bought as a bundle (Frontier winner)',
    token: 'No, assets in your wallet',
    exit: 'Sell each asset',
    keepers: 'None',
    create: 'Curated',
    earn: 'No',
  },
  {
    name: 'DiversiFi',
    what: 'Self-rebalancing vaults',
    token: 'Vault shares',
    exit: 'Vault withdraw',
    keepers: 'Protocol keepers',
    create: 'Curated',
    earn: 'No',
  },
  {
    name: 'GLAM',
    what: 'On-chain asset management for funds and managers',
    token: 'Fund shares',
    exit: 'Manager-defined',
    keepers: 'Manager and integrations',
    create: 'Manager setup',
    earn: 'Manager fees',
  },
  {
    name: 'Ondo Intelligent Portfolios',
    what: 'Model portfolios as one token, designed by BlackRock',
    token: 'Yes, eligible investors',
    exit: 'Issuer redemption',
    keepers: 'Issuer',
    create: 'Issuer only',
    earn: 'No',
  },
]

function CompetitorTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-pot-border">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-white/5 text-white">
          <tr>
            {['', 'What', 'Holdable token', 'Exit', 'Rebalancing', 'Creating', 'Creators earn'].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.name} className={`border-t border-pot-border align-top ${i === 0 ? 'bg-pot-green/5' : ''}`}>
              <td className={`px-3 py-2 font-semibold ${i === 0 ? 'text-pot-green' : 'text-white'}`}>{r.name}</td>
              <td className="px-3 py-2">{r.what}</td>
              <td className="px-3 py-2">{r.token}</td>
              <td className="px-3 py-2">{r.exit}</td>
              <td className="px-3 py-2">{r.keepers}</td>
              <td className="px-3 py-2">{r.create}</td>
              <td className="px-3 py-2">{r.earn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A section that opens on demand: title + one-line summary always visible, the long version inside. */
function Section({ title, summary, open = false, children }: { title: string; summary?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group mt-4 rounded-2xl border border-pot-border bg-pot-card/40 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5">
        <span>
          <span className="block text-lg font-bold text-white sm:text-xl">{title}</span>
          {summary && <span className="mt-1 block text-sm text-pot-muted">{summary}</span>}
        </span>
        <span className="mt-1 shrink-0 text-pot-muted transition group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <div className="space-y-3 px-5 pb-6 text-[15px] leading-relaxed text-pot-muted">{children}</div>
    </details>
  )
}
