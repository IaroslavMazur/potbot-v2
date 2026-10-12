import { NextResponse } from 'next/server'

/**
 * GET /api/pot-index/token-info?symbols=SOL,BTC
 * Market data for the listed assets (price, 24h change, market cap, volume, rank, logo) from
 * CoinGecko's public API, cached for 60 s. Devnet legs are test mints, so the card describes the
 * real asset the feed tracks.
 */
export const runtime = 'nodejs'
export const revalidate = 60

const IDS: Record<string, string> = {
  SOL: 'solana',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  XRP: 'ripple',
  JITOSOL: 'jito-staked-sol',
  PYTH: 'pyth-network',
  DOGE: 'dogecoin',
  TSLAX: 'tesla-xstock',
  QQQX: 'nasdaq-xstock',
}

export interface TokenInfo {
  symbol: string
  name: string
  image: string
  price: number
  change24h: number | null
  marketCap: number | null
  volume24h: number | null
  rank: number | null
  url: string
}

let cache: { at: number; data: Record<string, TokenInfo> } | null = null

export async function GET(req: Request) {
  const want = (new URL(req.url).searchParams.get('symbols') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  try {
    if (!cache || Date.now() - cache.at > 60_000) {
      const ids = Object.values(IDS).join(',')
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`, {
        headers: { accept: 'application/json' },
        next: { revalidate: 60 },
      })
      if (!r.ok) throw new Error(`coingecko ${r.status}`)
      const rows = (await r.json()) as Array<{ id: string; name: string; image: string; current_price: number; price_change_percentage_24h: number | null; market_cap: number | null; total_volume: number | null; market_cap_rank: number | null }>
      const data: Record<string, TokenInfo> = {}
      for (const [sym, id] of Object.entries(IDS)) {
        const row = rows.find((x) => x.id === id)
        if (!row) continue
        data[sym] = { symbol: sym, name: row.name, image: row.image, price: row.current_price, change24h: row.price_change_percentage_24h, marketCap: row.market_cap, volume24h: row.total_volume, rank: row.market_cap_rank, url: `https://www.coingecko.com/en/coins/${id}` }
      }
      cache = { at: Date.now(), data }
    }
    const out: Record<string, TokenInfo> = {}
    for (const s of want.length ? want : Object.keys(cache.data)) if (cache.data[s]) out[s] = cache.data[s]
    return NextResponse.json({ ok: true, tokens: out }, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } })
  } catch (e) {
    return NextResponse.json({ ok: false, tokens: {}, error: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
