import { NextResponse } from 'next/server'
import { Connection, Keypair } from '@solana/web3.js'
import { getRpcUrl } from '@/lib/rpc'
import registry from '@/lib/pot-index/assets.devnet.json'
import { postPricesAs } from '@/lib/pot-index/pyth-server'

/**
 * POST /api/pot-index/prices  { feedIds: string[] }
 * The operator posts the latest Pyth prices for listed feeds and pays their rent, so the holder's
 * deposit is one transaction that references them. Only feeds of listed assets are accepted.
 * The caller returns the accounts through /api/pot-index/cleanup when done.
 */
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet').toLowerCase()
  if (network.startsWith('mainnet')) return NextResponse.json({ error: 'devnet operator only' }, { status: 403 })
  const secret = process.env.POT_INDEX_FAUCET_KEYPAIR
  if (!secret) return NextResponse.json({ error: 'operator not configured' }, { status: 503 })
  let feedIds: string[] = []
  try {
    const body = (await req.json()) as { feedIds?: string[] }
    const listed = new Set(Object.values(registry.assets as Record<string, { feedId: string }>).map((a) => a.feedId.toLowerCase()))
    feedIds = Array.from(new Set((body.feedIds ?? []).map((f) => f.toLowerCase()))).filter((f) => listed.has(f)).slice(0, 8)
    if (!feedIds.length) throw new Error('no listed feeds')
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  try {
    const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
    const connection = new Connection(getRpcUrl(), 'confirmed')
    const posted = await postPricesAs(connection, operator, feedIds)
    return NextResponse.json({ ok: true, feedIds, priceUpdates: posted.priceUpdates.map((k) => k.toBase58()), cleanup: posted.cleanup })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
