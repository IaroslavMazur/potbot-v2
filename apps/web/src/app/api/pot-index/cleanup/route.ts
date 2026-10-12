import { NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getRpcUrl } from '@/lib/rpc'
import { closePrices } from '@/lib/pot-index/pyth-server'

/**
 * POST /api/pot-index/cleanup  { accounts: string[] }
 * Closes the operator-paid Pyth price-update accounts of a finished session (rent back to the
 * operator) and sweeps the operator's leftover encoded-VAA accounts. Anyone may call it: the
 * instructions only succeed for accounts whose write authority is the operator, and the rent
 * can only go back to the operator.
 */
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const secret = process.env.POT_INDEX_FAUCET_KEYPAIR
  if (!secret) return NextResponse.json({ error: 'operator not configured' }, { status: 503 })
  let accounts: PublicKey[] = []
  try {
    const body = (await req.json()) as { accounts?: string[] }
    accounts = (body.accounts ?? []).slice(0, 16).map((a) => new PublicKey(a))
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  try {
    const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
    const connection = new Connection(getRpcUrl(), 'confirmed')
    const sigs = await closePrices(connection, operator, accounts)
    return NextResponse.json({ ok: true, sigs })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
