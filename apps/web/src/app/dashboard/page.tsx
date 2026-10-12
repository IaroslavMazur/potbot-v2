'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PageHeader } from '@/components/PageHeader'
import { ConnectButton } from '@/components/ConnectButton'
import { usePotIndexProgram, usePots, useAllPotStats } from '@/hooks/usePotIndex'
import { fetchPotActivity, fetchWalletPosition, type PotEvent, type PotView } from '@/lib/pot-index/client'
import { plantSrc, potSeries, stageForUsd, STAGES } from '@/lib/pot-index/garden'
import { ENTRY_FEE_BPS } from '@/lib/pot-index/client'
import { explorerTx } from '@/lib/pot-index/registry'

const usd = (v: number, d = 2) => `$${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`
const CREATOR_SHARE = 0.4 // of the entry fee

/**
 * My Dashboard: only what belongs to the connected wallet. Positions with the share of each
 * POTFolio, the POTFolios this wallet created with the fees they earned, and the wallet's own
 * activity. Everything is read from the chain (token accounts + transaction history).
 */
export default function DashboardPage() {
  const { connection, pubkey } = usePotIndexProgram()
  const pots = usePots()
  const stats = useAllPotStats(pots.data)
  const me = pubkey?.toBase58()

  const data = useQuery({
    queryKey: ['pot-index', 'dashboard', me, (pots.data ?? []).map((p) => p.address.toBase58()).join(',')],
    enabled: !!pubkey && !!pots.data && pots.data.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const list = pots.data!
      const atas = list.map((p) => getAssociatedTokenAddressSync(p.indexMint, pubkey!))
      const infos = await connection.getMultipleAccountsInfo(atas, 'confirmed')
      const positions: { pot: PotView; shares: number; costUsd: number; realizedUsd: number; depositedUsd: number; withdrawnUsd: number }[] = []
      for (let i = 0; i < list.length; i++) {
        if (!infos[i]) continue
        const bal = await connection.getTokenAccountBalance(atas[i], 'confirmed').catch(() => null)
        const shares = Number(bal?.value.uiAmount ?? 0)
        const pos = await fetchWalletPosition(connection, list[i], pubkey!).catch(() => null)
        if (shares <= 0 && !(pos && pos.events > 0)) continue
        positions.push({ pot: list[i], shares, costUsd: pos?.costUsd ?? 0, realizedUsd: pos?.realizedUsd ?? 0, depositedUsd: pos?.depositedUsd ?? 0, withdrawnUsd: pos?.withdrawnUsd ?? 0 })
      }
      // POTFolios this wallet created: entry fees earned (40% of each deposit's fee), from the Pot's history.
      const mine = list.filter((p) => p.creator.equals(pubkey!))
      const created: { pot: PotView; deposits: number; feesUsd: number; events: PotEvent[] }[] = []
      for (const p of mine) {
        const ev = await fetchPotActivity(connection, p, 100).catch(() => [] as PotEvent[])
        const deps = ev.filter((e): e is Extract<PotEvent, { kind: 'deposit' }> => e.kind === 'deposit')
        created.push({ pot: p, deposits: deps.length, feesUsd: deps.reduce((s, e) => s + e.feeUsdc * CREATOR_SHARE, 0), events: ev })
      }
      // The wallet's own activity across the POTFolios it touched.
      type Mine = (Extract<PotEvent, { kind: 'deposit' }> | Extract<PotEvent, { kind: 'exit' }>) & { pot: PotView }
      const activity: Mine[] = []
      for (const h of positions) {
        const ev = await fetchPotActivity(connection, h.pot, 60).catch(() => [] as PotEvent[])
        for (const e of ev) if ((e.kind === 'deposit' || e.kind === 'exit') && e.user === me) activity.push({ ...e, pot: h.pot } as Mine)
      }
      activity.sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
      return { positions, created, activity: activity.slice(0, 20) }
    },
  })

  const rows = useMemo(
    () =>
      (data.data?.positions ?? []).map((h) => {
        const st = stats.data?.[h.pot.address.toBase58()]
        const value = h.shares * (st?.indexPrice ?? 1)
        const pnl = h.costUsd > 0 ? value - h.costUsd : 0
        const share = st && st.supply > 0 ? (h.shares / st.supply) * 100 : 0
        return { ...h, value, pnl, pct: h.costUsd > 0 ? (pnl / h.costUsd) * 100 : 0, share, nav: st?.navUsd ?? 0 }
      }),
    [data.data, stats.data],
  )
  const total = rows.reduce((a, r) => a + r.value, 0)
  const totalPnl = rows.reduce((a, r) => a + r.pnl, 0)
  const totalRealized = rows.reduce((a, r) => a + r.realizedUsd, 0)
  const creatorFees = (data.data?.created ?? []).reduce((a, c) => a + c.feesUsd, 0)
  const tone = (v: number) => (v >= 0 ? 'text-pot-green' : 'text-red-300')
  const sign = (v: number) => (v >= 0 ? '+' : '−')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="My dashboard" title={pubkey ? 'Yours, from the chain' : 'My dashboard'} lede={pubkey ? 'Only what this wallet holds, created and did. Nothing here is stored by PotBot.' : 'Connect a wallet to see your POTFolios, your entry prices and what you earned.'} />

      {!pubkey && (
        <div className="card flex flex-col items-start gap-3 p-6">
          <ConnectButton />
          <Link href="/portfolios" className="text-sm text-pot-green hover:underline">or browse POTFolios first →</Link>
        </div>
      )}

      {pubkey && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <Tile label="Holdings value" value={usd(total)} />
            <Tile label="Unrealized P&L" value={`${sign(totalPnl)}${usd(Math.abs(totalPnl))}`} tone={tone(totalPnl)} />
            <Tile label="Realized (to USDC)" value={`${sign(totalRealized)}${usd(Math.abs(totalRealized))}`} tone={tone(totalRealized)} />
            <Tile label="Creator fees earned" value={usd(creatorFees)} hint={`${CREATOR_SHARE * 100}% of each ${ENTRY_FEE_BPS / 100}% entry fee`} />
          </div>

          <section className="card mb-6 p-5">
            <h2 className="mb-3 font-semibold text-white">Your POTFolios</h2>
            {data.isLoading && <p className="text-sm text-white/70">Reading your wallet…</p>}
            {data.data && rows.length === 0 && (
              <p className="text-sm text-white/70">Nothing yet. Pick a POTFolio, deposit USDC, one signature.</p>
            )}
            <div className="divide-y divide-pot-border/60">
              {rows.map((r) => {
                const lvl = stageForUsd(r.nav)
                return (
                  <Link key={r.pot.address.toBase58()} href={`/portfolios/${r.pot.indexMint.toBase58()}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 transition hover:bg-white/[0.03] sm:grid-cols-[auto_1fr_auto_auto_auto]">
                    <img src={plantSrc(potSeries(r.pot), lvl)} alt="" className="h-10 w-10 rounded-lg object-contain" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{r.pot.name} <span className="text-white/50">${r.pot.symbol}</span></div>
                      <div className="text-xs text-white/60">{r.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens · avg entry {r.shares > 0 && r.costUsd > 0 ? usd(r.costUsd / r.shares, 4) : '—'} · Level {lvl} {STAGES[lvl - 1].name}</div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-xs text-white/50">your share</div>
                      <div className="font-semibold text-white">{r.share.toFixed(2)}%</div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-xs text-white/50">of {usd(r.nav, 0)}</div>
                      <div className="font-semibold text-white">{usd(r.value)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-white sm:hidden">{usd(r.value)}</div>
                      <div className={`text-xs font-semibold ${tone(r.pnl)}`}>{r.costUsd > 0 ? `${sign(r.pnl)}${usd(Math.abs(r.pnl))} (${r.pnl >= 0 ? '+' : ''}${r.pct.toFixed(2)}%)` : ''}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/portfolios" className="btn-secondary">Browse POTFolios</Link>
              <Link href="/portfolios/new" className="btn-primary">Create your own</Link>
            </div>
          </section>

          <section className="card mb-6 p-5">
            <h2 className="font-semibold text-white">Invite and earn</h2>
            <p className="mt-1 text-sm text-white/70">Deposits made through your link pay you {CREATOR_SHARE * 100}% of the {ENTRY_FEE_BPS / 100}% entry fee, on-chain, in the same transaction. One link per POTFolio.</p>
            <div className="mt-3 space-y-2">
              {(rows.length ? rows.map((r) => r.pot) : (pots.data ?? []).slice(0, 3)).map((p) => {
                const link = `${typeof window !== 'undefined' ? window.location.origin : 'https://potbot.fun'}/portfolios/${p.indexMint.toBase58()}?ref=${me}`
                return (
                  <div key={p.address.toBase58()} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-sm text-white">${p.symbol}</span>
                    <input readOnly value={link} className="input flex-1 truncate text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn-secondary shrink-0" onClick={() => { void navigator.clipboard.writeText(link); toast.success(`Link for $${p.symbol} copied`) }}>Copy</button>
                  </div>
                )
              })}
            </div>
          </section>

          {data.data && data.data.created.length > 0 && (
            <section className="card mb-6 p-5">
              <h2 className="mb-3 font-semibold text-white">POTFolios you created</h2>
              <div className="divide-y divide-pot-border/60">
                {data.data.created.map((c) => {
                  const st = stats.data?.[c.pot.address.toBase58()]
                  return (
                    <Link key={c.pot.address.toBase58()} href={`/portfolios/${c.pot.indexMint.toBase58()}`} className="flex items-center gap-3 py-3 transition hover:bg-white/[0.03]">
                      <img src={plantSrc(potSeries(c.pot), stageForUsd(st?.navUsd ?? 0))} alt="" className="h-9 w-9 rounded-lg object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white">{c.pot.name} <span className="text-white/50">${c.pot.symbol}</span></div>
                        <div className="text-xs text-white/60">TVL {usd(st?.navUsd ?? 0, 0)} · {st?.holders ?? 0} holders · {c.deposits} deposits</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/50">fees earned</div>
                        <div className="font-semibold text-pot-green">{usd(c.feesUsd)}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {data.data && data.data.activity.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold text-white">Your activity</h2>
              <ul className="divide-y divide-pot-border/60 text-sm">
                {data.data.activity.map((e) => (
                  <li key={e.sig} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-white">
                      {e.kind === 'deposit' ? `Deposited ${usd(e.amountUsdc)} → ${e.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} $${e.pot.symbol}` : `Redeemed ${e.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} $${e.pot.symbol}${e.toUsdc ? ` → ${usd(e.usdcOut)}` : ' for the assets'}`}
                    </span>
                    <span className="shrink-0 text-xs text-white/50">
                      {e.time ? new Date(e.time * 1000).toLocaleString() : ''} <a className="ml-1 text-pot-green hover:underline" href={explorerTx(e.sig)} target="_blank" rel="noreferrer">tx ↗</a>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className={`mt-0.5 text-xl font-black ${tone ?? 'text-white'}`}>{value}</div>
      {hint && <div className="text-[11px] text-white/40">{hint}</div>}
    </div>
  )
}
