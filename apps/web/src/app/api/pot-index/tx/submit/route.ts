import { NextResponse } from 'next/server'
import { PublicKey, VersionedTransaction } from '@solana/web3.js'
import { fetchPot } from '@/lib/pot-index/client'
import { allocateAsKeeper, assertDevnet, operatorConnection, operatorKeypair, refreshPrices, sendAndConfirm, verifyToken } from '@/lib/pot-index/operator.server'

/**
 * POST /api/pot-index/tx/submit  { tx: base64 (signed by the holder), token }
 * The operator refreshes the Pyth prices the transaction reads, adds its own signature (nonce
 * authority, devnet market maker), sends, confirms. For a deposit it then deploys the cash into
 * the basket as keeper. The token proves the operator built exactly these message bytes, so it
 * never co-signs anything else.
 */
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    assertDevnet()
    const op = operatorKeypair()
    const b = (await req.json()) as { tx?: string; token?: string }
    const tx = VersionedTransaction.deserialize(Buffer.from(b.tx ?? '', 'base64'))
    const t = verifyToken(op, tx, b.token ?? '')
    const keys = tx.message.staticAccountKeys
    const holder = new PublicKey(t.wallet)
    const hi = keys.findIndex((k) => k.equals(holder))
    if (hi < 0 || tx.signatures[hi].every((x) => x === 0)) return NextResponse.json({ error: 'not signed by the holder' }, { status: 400 })
    const connection = operatorConnection()
    if (t.feedIds.length) await refreshPrices(connection, op, t.feedIds)
    // Expired before it reached us? Say so plainly instead of a failed send.
    if ((await connection.getBlockHeight('confirmed')) > t.lastValidBlockHeight) return NextResponse.json({ error: 'That signature took longer than the network allows (about a minute). Nothing changed. Confirm again.' }, { status: 409 })
    const opIndex = keys.findIndex((k) => k.equals(op.publicKey))
    if (opIndex >= 0 && tx.message.isAccountSigner(opIndex)) tx.sign([op])
    const sig = await sendAndConfirm(connection, tx, { blockhash: t.blockhash, lastValidBlockHeight: t.lastValidBlockHeight })
    let allocated: string[] = []
    if (t.kind === 'deposit') {
      try {
        const pot = await fetchPot(connection, new PublicKey(t.mint))
        if (pot) allocated = await allocateAsKeeper(connection, op, pot, await refreshPrices(connection, op, pot.legs.map((l) => l.feedId)))
      } catch {
        /* keepers finish later */
      }
    }
    return NextResponse.json({ ok: true, sig, allocated })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: m }, { status: 500 })
  }
}
