import { NextResponse } from 'next/server'
import { getRpcUrl } from '@/lib/rpc'
import { AnchorProvider, Program, type Idl, type Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from '@solana/web3.js'
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import idl from '@/lib/pot-index/idl.json'
import registry from '@/lib/pot-index/assets.devnet.json'
import { buildExitUsdcPair, fetchPot, fetchPotBalances, EXIT_FEE_BPS } from '@/lib/pot-index/client'
import { fetchHermesPrices } from '@/lib/pot-index/pyth-post'
import { postPricesAs } from '@/lib/pot-index/pyth-server'

/**
 * POST /api/pot-index/exit-usdc  { wallet, mint, shares }
 *
 * Devnet market maker for "exit to USDC". Posts the Pyth prices itself, then builds ONE transaction
 * for the holder to sign: exit_usdc_open → holder sends each leg to the market maker → market maker
 * pays USDC at the Hermes mid price → exit_usdc_close. The price accounts are closed afterwards
 * through /api/pot-index/cleanup (rent back to the market maker).
 * The market maker is the test-USDC mint authority (POT_INDEX_FAUCET_KEYPAIR), so it pays by
 * minting; on mainnet the sale step becomes Jupiter swaps signed by the holder alone.
 * The program enforces the minimum (Pyth price − conf, minus slippage, minus 0.10% fee) on-chain,
 * so this server cannot short the holder even if it wanted to.
 */
export const runtime = 'nodejs'

const BPS = 10_000

function readOnlyWallet(publicKey: PublicKey): Wallet {
  return { publicKey, signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T) => t } as unknown as Wallet
}

export async function POST(req: Request) {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet').toLowerCase()
  if (network.startsWith('mainnet')) return NextResponse.json({ error: 'devnet market maker only' }, { status: 403 })
  const secret = process.env.POT_INDEX_FAUCET_KEYPAIR
  if (!secret) return NextResponse.json({ error: 'market maker not configured' }, { status: 503 })

  let wallet: PublicKey
  let mint: PublicKey
  let shares: bigint
  let clientBlockhash: string | null = null
  try {
    const body = (await req.json()) as { wallet?: string; mint?: string; shares?: string | number; blockhash?: string }
    wallet = new PublicKey(body.wallet ?? '')
    clientBlockhash = typeof body.blockhash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.blockhash) ? body.blockhash : null
    mint = new PublicKey(body.mint ?? '')
    shares = BigInt(body.shares ?? 0)
    if (shares <= 0n) throw new Error('shares')
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  try {
    const mm = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
    const connection = new Connection(getRpcUrl(), 'confirmed')
    const usdcMint = new PublicKey(registry.usdcMint)
    const treasury = new PublicKey(registry.treasury)
    const pot = await fetchPot(connection, mint)
    if (!pot) return NextResponse.json({ error: 'pot not found' }, { status: 404 })
    const bal = await fetchPotBalances(connection, pot)
    if (BigInt(bal.supply) < shares) return NextResponse.json({ error: 'shares exceed supply' }, { status: 400 })

    // What the holder will receive per leg (same integer math as the program) and its mid-price value.
    const feedIds = pot.legs.map((l) => l.feedId)
    const prices = await fetchHermesPrices(feedIds)
    const legOut = pot.legs.map((l, i) => {
      const gross = (BigInt(bal.legs[i]) * shares) / BigInt(bal.supply)
      return (gross * BigInt(BPS - EXIT_FEE_BPS)) / BigInt(BPS)
    })
    let payUsdc = 0n
    pot.legs.forEach((l, i) => {
      const p = prices[l.feedId]?.price ?? 0
      if (p <= 0) throw new Error(`no price for leg ${i}`)
      // base units × price → micro-USD
      payUsdc += BigInt(Math.floor((Number(legOut[i]) / 10 ** l.decimals) * p * 1e6))
    })

    const program = new Program(idl as Idl, new AnchorProvider(connection, readOnlyWallet(wallet), { commitment: 'confirmed' }))

    // The market maker posts the Pyth prices and pays their rent (reclaimed via /cleanup), so the
    // holder signs ONE transaction: open → sell legs → get paid → close. Their wallet simulates it
    // cleanly because the price accounts already exist. The exit must be one transaction anyway
    // (open … close is checked on-chain).
    const mmAtas = pot.legs.filter((_, i) => legOut[i] > 0n).map((l) => ({ mint: l.mint, ata: getAssociatedTokenAddressSync(l.mint, mm.publicKey) }))
    const missing = (await connection.getMultipleAccountsInfo(mmAtas.map((a) => a.ata))).map((info, i) => (info ? null : mmAtas[i])).filter((a) => a !== null)
    const [posted] = await Promise.all([
      postPricesAs(connection, mm, feedIds),
      missing.length
        ? (async () => {
            const { blockhash: bh } = await connection.getLatestBlockhash('confirmed')
            const ixs = missing.map((a) => createAssociatedTokenAccountIdempotentInstruction(mm.publicKey, a.ata, mm.publicKey, a.mint))
            const v = new VersionedTransaction(new TransactionMessage({ payerKey: mm.publicKey, recentBlockhash: bh, instructions: ixs }).compileToV0Message())
            v.sign([mm])
            const sig = await connection.sendRawTransaction(v.serialize(), { maxRetries: 5 })
            await connection.confirmTransaction(sig, 'confirmed')
          })()
        : Promise.resolve(),
    ])
    const { pre, open, close } = await buildExitUsdcPair(program, {
      pot,
      user: wallet,
      usdcMint,
      treasury,
      shares: Number(shares),
      minUsdcOut: 0,
      priceUpdates: posted.priceUpdates,
    })
    const userUsdc = getAssociatedTokenAddressSync(usdcMint, wallet)
    const sale: TransactionInstruction[] = []
    pot.legs.forEach((l, i) => {
      if (legOut[i] === 0n) return
      const mmAta = getAssociatedTokenAddressSync(l.mint, mm.publicKey)
      sale.push(createTransferCheckedInstruction(getAssociatedTokenAddressSync(l.mint, wallet), l.mint, mmAta, wallet, legOut[i], l.decimals))
    })
    const pay = payUsdc > 0n ? [createMintToInstruction(usdcMint, userUsdc, mm.publicKey, payUsdc)] : []
    // The holder's browser sends the blockhash its own RPC just returned, so the node that will
    // send the transaction is guaranteed to know it. Fallback: our RPC.
    const blockhash = clientBlockhash ?? (await connection.getLatestBlockhash('confirmed')).blockhash
    const v0 = (ixs: TransactionInstruction[]) =>
      new VersionedTransaction(new TransactionMessage({ payerKey: wallet, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message())
    // `pre` creates the holder's USDC account if needed (idempotent, tiny); it rides in the same
    // transaction unless that would not fit.
    let exitTx = v0([...pre, open, ...sale, ...pay, close])
    const txs: VersionedTransaction[] = []
    if (exitTx.serialize().length > 1232) {
      txs.push(v0(pre))
      exitTx = v0([open, ...sale, ...pay, close])
    }
    txs.push(exitTx)
    const out = txs.map((v) => {
      const needsMm = v.message.staticAccountKeys.some((k, i) => k.equals(mm.publicKey) && v.message.isAccountSigner(i))
      if (needsMm) v.sign([mm])
      return Buffer.from(v.serialize()).toString('base64')
    })
    return NextResponse.json({ ok: true, txs: out, payUsdc: payUsdc.toString(), legOut: legOut.map(String), cleanup: posted.cleanup })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
