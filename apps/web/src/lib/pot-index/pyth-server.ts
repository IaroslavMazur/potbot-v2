/**
 * Server-side Pyth price session: the operator key (devnet market maker) posts the price
 * updates and pays their rent, so the holder's wallet signs ONE transaction instead of a
 * 7-transaction bundle. The holder's wallet then simulates cleanly (the price accounts exist),
 * and the 60 s oracle window only has to cover one signature, not seven simulations.
 *
 * Rent (~0.01 SOL per session) comes back to the operator through /api/pot-index/cleanup,
 * which the client calls after its transaction lands; a sweep of orphaned accounts is in
 * `sweepOrphans`.
 */
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import type { Wallet } from '@coral-xyz/anchor'
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver'
import { HermesClient } from '@pythnetwork/hermes-client'

const HERMES_URL = process.env.NEXT_PUBLIC_PYTH_HERMES_URL ?? 'https://hermes.pyth.network'
const HERMES_OPTS = process.env.PYTH_API_KEY ? { accessToken: process.env.PYTH_API_KEY } : {}
const FEE = { computeUnitPriceMicroLamports: 50_000 }

/** Anchor-style wallet around a Keypair (the anchor NodeWallet is not exported for the browser build). */
function keypairWallet(kp: Keypair): Wallet {
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => {
      if (tx instanceof VersionedTransaction) tx.sign([kp])
      else tx.partialSign(kp)
      return tx
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([kp])
        else tx.partialSign(kp)
      }
      return txs
    },
  } as unknown as Wallet
}

export interface PostedPrices {
  /** One price-update account per feed id, in the order of `feedIds`. */
  priceUpdates: PublicKey[]
  /** Accounts the operator should close once the consumer transaction has landed. */
  cleanup: string[]
  /** Signatures of the posting transactions (for logs). */
  sigs: string[]
}

async function sendSigned(connection: Connection, tx: VersionedTransaction, signers: Keypair[]): Promise<string> {
  tx.sign(signers)
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  return sig
}

/** Post the latest Hermes prices for `feedIds` with `payer` paying, and confirm them. */
export async function postPricesAs(connection: Connection, payer: Keypair, feedIds: string[]): Promise<PostedPrices> {
  const hermes = new HermesClient(HERMES_URL, HERMES_OPTS)
  const latest = await hermes.getLatestPriceUpdates(feedIds, { encoding: 'base64' })
  const receiver = new PythSolanaReceiver({ connection, wallet: keypairWallet(payer) })
  const { postInstructions, priceFeedIdToPriceUpdateAccount } = await receiver.buildPostPriceUpdateInstructions(latest.binary.data as string[])
  const builder = receiver.newTransactionBuilder({ closeUpdateAccounts: false })
  builder.addInstructions(postInstructions)
  const txs = await builder.buildVersionedTransactions(FEE)
  // The first transaction writes and verifies the VAA; the PostUpdate ones depend on it and are
  // independent of each other, so they go in parallel.
  const sigs: string[] = []
  if (txs.length) sigs.push(await sendSigned(connection, txs[0].tx, [payer, ...(txs[0].signers as Keypair[])]))
  sigs.push(...(await Promise.all(txs.slice(1).map((t) => sendSigned(connection, t.tx, [payer, ...(t.signers as Keypair[])])))))
  const priceUpdates = feedIds.map((id) => {
    const k = priceFeedIdToPriceUpdateAccount[id]
    if (!k) throw new Error(`no price update account for ${id}`)
    return k
  })
  return { priceUpdates, cleanup: priceUpdates.map((k) => k.toBase58()), sigs }
}

/** Close price-update accounts owned by `payer` (rent back to the payer) and sweep its encoded VAAs. */
export async function closePrices(connection: Connection, payer: Keypair, accounts: PublicKey[]): Promise<string[]> {
  const receiver = new PythSolanaReceiver({ connection, wallet: keypairWallet(payer) })
  const builder = receiver.newTransactionBuilder({ closeUpdateAccounts: false })
  const ixs = []
  for (const a of accounts) {
    const info = await connection.getAccountInfo(a, 'confirmed')
    if (!info) continue // already closed
    ixs.push(await receiver.buildClosePriceUpdateInstruction(a))
  }
  builder.addInstructions(ixs)
  await builder.addClosePreviousEncodedVaasInstructions(8)
  const txs = await builder.buildVersionedTransactions(FEE)
  const sigs: string[] = []
  for (const t of txs) {
    try {
      sigs.push(await sendSigned(connection, t.tx, [payer, ...(t.signers as Keypair[])]))
    } catch {
      /* best effort: an account closed by a parallel call, or already gone */
    }
  }
  return sigs
}
