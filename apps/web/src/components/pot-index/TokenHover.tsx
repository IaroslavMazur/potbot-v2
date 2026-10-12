'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import type { TokenInfo } from '@/app/api/pot-index/token-info/route'

export function useTokenInfo() {
  return useQuery({
    queryKey: ['pot-index', 'token-info'],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const r = await fetch('/api/pot-index/token-info')
      const j = (await r.json()) as { tokens: Record<string, TokenInfo> }
      return j.tokens ?? {}
    },
  })
}

const fmtUsd = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString(undefined, { maximumFractionDigits: digits })}`

/** Wraps a symbol; hovering (or tapping) shows a market card for the real asset the leg tracks. */
export function TokenHover({ symbol, children }: { symbol: string; children: ReactNode }) {
  const info = useTokenInfo()
  const [open, setOpen] = useState(false)
  const t = info.data?.[symbol.toUpperCase()]
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen((o) => !o)}>
      <span className="cursor-help border-b border-dotted border-white/30">{children}</span>
      {open && t && (
        <span className="absolute left-0 top-full z-30 mt-2 block w-64 rounded-xl border border-pot-border bg-pot-dark p-3 text-left text-xs shadow-2xl">
          <span className="flex items-center gap-2">
            <img src={t.image} alt="" className="h-6 w-6 rounded-full" />
            <span className="font-semibold text-white">{t.name}</span>
            <span className="text-white/50">{t.symbol}</span>
            {t.rank && <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">#{t.rank}</span>}
          </span>
          <span className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-black text-white">{fmtUsd(t.price, t.price < 1 ? 4 : 2)}</span>
            {t.change24h !== null && (
              <span className={`font-semibold ${t.change24h >= 0 ? 'text-pot-green' : 'text-red-300'}`}>{t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}% 24h</span>
            )}
          </span>
          <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-white/70">
            <span>Market cap</span><span className="text-right text-white">{fmtUsd(t.marketCap)}</span>
            <span>Volume 24h</span><span className="text-right text-white">{fmtUsd(t.volume24h)}</span>
          </span>
          <a href={t.url} target="_blank" rel="noreferrer" className="mt-2 block text-pot-green hover:underline" onClick={(e) => e.stopPropagation()}>CoinGecko ↗</a>
        </span>
      )}
    </span>
  )
}
