/**
 * Server-side operator for the POTFolio flows (devnet: the market maker key).
 *
 * Why this exists: a browser wallet can take a minute or more to sign (its own simulation, the
 * person reading the prompt). A Solana transaction built on a recent blockhash lives ~60-90 s and
 * a Pyth price is accepted for 60 s, so anything that depends on "sign quickly" breaks a live demo.
 * Here nothing depends on how long the holder takes:
 *   - the holder's transaction uses a DURABLE NONCE (one per wallet, operator is the authority),
 *     so the signed transaction does not expire;
 *   - the Pyth prices live in PERSISTENT price-update accounts (one per feed, operator is the
 *     write authority) that the operator refreshes right before it submits, so the price the
 *     program reads is seconds old whatever the signing time;
 *   - the operator submits: it adds its signature (nonce authority, devnet market maker) only to a
 *     transaction it built itself (HMAC token), sends it and confirms it.
 * The holder signs exactly one transaction per action. Cash deploys after a deposit are done by
 * the operator acting as keeper (permissionless on-chain), so the holder does not sign those.
 */
import crypto from 'node:crypto'
import {
  Connection,
  Keypair,
  NONCE_ACCOUNT_LENGTH,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js'
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { AnchorProvider, Program, type Idl, type Wallet } from '@coral-xyz/anchor'
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver'
import { HermesClient } from '@pythnetwork/hermes-client'
import idl from '@/lib/pot-index/idl.json'
import registry from '@/lib/pot-index/assets.devnet.json'
import { getRpcUrl } from '@/lib/rpc'
import { buildRebalancePair, CASH_LEG, fetchPotBalances, type PotView } from '@/lib/pot-index/client'
import { fetchHermesPrices } from '@/lib/pot-index/pyth-post'

const HERMES_URL = process.env.NEXT_PUBLIC_PYTH_HERMES_URL ?? 'https://hermes.pyth.network'
const HERMES_OPTS = process.env.PYTH_API_KEY ? { accessToken: process.env.PYTH_API_KEY } : {}
const FEE = { computeUnitPriceMicroLamports: 50_000 }
const PYTH_RECEIVER = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ')

export function operatorKeypair(): Keypair {
  const secret = process.env.POT_INDEX_FAUCET_KEYPAIR
  if (!secret) throw new Error('operator not configured')
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
}

export function operatorConnection(): Connection {
  return new Connection(getRpcUrl(), 'confirmed')
}

export function assertDevnet() {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet').toLowerCase()
  if (network.startsWith('mainnet')) throw new Error('devnet operator only')
}

function keypairWallet(kp: Keypair): Wallet {
  const sign = <T extends Transaction | VersionedTransaction>(tx: T) => {
    if (tx instanceof VersionedTransaction) tx.sign([kp])
    else tx.partialSign(kp)
    return tx
  }
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => sign(tx),
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs.map(sign),
  } as unknown as Wallet
}

export function readOnlyWallet(publicKey: PublicKey): Wallet {
  return { publicKey, signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T) => t } as unknown as Wallet
}

export function potProgram(connection: Connection, as: PublicKey): Program {
  return new Program(idl as Idl, new AnchorProvider(connection, readOnlyWallet(as), { commitment: 'confirmed' }))
}

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------

type Confirm =
  | { blockhash: string; lastValidBlockHeight: number }
  | { nonceAccountPubkey: PublicKey; nonceValue: string; minContextSlot: number }

/** Send a fully signed transaction and wait for 'confirmed' (websocket subscription, no polling). */
export async function sendAndConfirm(connection: Connection, tx: VersionedTransaction, how: Confirm): Promise<string> {
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: false, preflightCommitment: 'confirmed' })
  const res = await connection.confirmTransaction({ signature: sig, ...how } as never, 'confirmed')
  if (res.value.err) throw new Error(`transaction failed on-chain: ${JSON.stringify(res.value.err)} (${sig})`)
  return sig
}

async function sendOperatorTx(connection: Connection, op: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []): Promise<string> {
  const bh = await connection.getLatestBlockhash('confirmed')
  const v = new VersionedTransaction(new TransactionMessage({ payerKey: op.publicKey, recentBlockhash: bh.blockhash, instructions: ixs }).compileToV0Message())
  v.sign([op, ...extra])
  return sendAndConfirm(connection, v, bh)
}

// ---------------------------------------------------------------------------------------------
// Persistent Pyth price accounts
// ---------------------------------------------------------------------------------------------

/** Deterministic keypair for the persistent price-update account of `feedId` (operator-derived). */
function priceKeypair(op: Keypair, feedId: string): Keypair {
  const seed = crypto.createHash('sha256').update(Buffer.from(op.secretKey)).update('potbot-price:' + feedId.toLowerCase()).digest()
  return Keypair.fromSeed(seed)
}

export function priceAccountFor(op: Keypair, feedId: string): PublicKey {
  return priceKeypair(op, feedId).publicKey
}

/**
 * Post the latest Hermes prices for `feedIds` into the operator's persistent price-update accounts
 * (created on first use, overwritten afterwards; the receiver allows it for the same write
 * authority). Returns the accounts in `feedIds` order once every update is confirmed.
 */
export async function refreshPrices(connection: Connection, op: Keypair, feedIds: string[]): Promise<PublicKey[]> {
  const ids = Array.from(new Set(feedIds.map((f) => f.toLowerCase())))
  const hermes = new HermesClient(HERMES_URL, HERMES_OPTS)
  const latest = await hermes.getLatestPriceUpdates(ids, { encoding: 'base64' })
  const receiver = new PythSolanaReceiver({ connection, wallet: keypairWallet(op) })
  const { postInstructions, priceFeedIdToPriceUpdateAccount, closeInstructions } = await receiver.buildPostPriceUpdateInstructions(
    latest.binary.data as string[],
  )
  // Swap each ephemeral price-update account for the persistent one of its feed.
  const swap = new Map<string, Keypair>()
  for (const [feed, eph] of Object.entries(priceFeedIdToPriceUpdateAccount)) swap.set(eph.toBase58(), priceKeypair(op, feed))
  const post = postInstructions.map((p) => {
    let hit: Keypair | undefined
    const keys = p.instruction.keys.map((k) => {
      const kp = swap.get(k.pubkey.toBase58())
      if (!kp) return k
      hit = kp
      return { ...k, pubkey: kp.publicKey }
    })
    const instruction = { ...p.instruction, keys } as TransactionInstruction
    const signers = p.signers.filter((s) => !swap.has(s.publicKey.toBase58()))
    if (hit) signers.push(hit)
    return { ...p, instruction, signers }
  })
  const postB = receiver.newTransactionBuilder({ closeUpdateAccounts: false })
  postB.addInstructions(post)
  const txs = await postB.buildVersionedTransactions(FEE)
  // The first transaction writes and verifies the VAA; the updates depend on it only.
  const bh = await connection.getLatestBlockhash('confirmed')
  const send = (t: { tx: VersionedTransaction; signers: unknown[] }) => {
    t.tx.message.recentBlockhash = bh.blockhash
    t.tx.sign([op, ...(t.signers as Keypair[])])
    return sendAndConfirm(connection, t.tx, bh)
  }
  if (txs.length) await send(txs[0])
  await Promise.all(txs.slice(1).map(send))
  // Close the encoded VAA (rent back to the operator); keep the price accounts.
  const closeVaa = closeInstructions.filter((c) => !c.instruction.programId.equals(PYTH_RECEIVER))
  if (closeVaa.length) {
    const closeB = receiver.newTransactionBuilder({ closeUpdateAccounts: false })
    closeB.addInstructions(closeVaa)
    for (const t of await closeB.buildVersionedTransactions(FEE)) await send(t).catch(() => {})
  }
  return feedIds.map((f) => priceKeypair(op, f).publicKey)
}

// ---------------------------------------------------------------------------------------------
// Durable nonce per wallet
// ---------------------------------------------------------------------------------------------

async function nonceAddressAsync(op: Keypair, wallet: PublicKey) {
  const seed = 'pn' + wallet.toBase58().slice(0, 30)
  const address = await PublicKey.createWithSeed(op.publicKey, seed, SystemProgram.programId)
  return { address, seed }
}

/** The wallet's nonce account (created by the operator on first use) and its current value. */
export async function ensureNonce(connection: Connection, op: Keypair, wallet: PublicKey): Promise<{ address: PublicKey; value: string }> {
  const { address, seed } = await nonceAddressAsync(op, wallet)
  let info = await connection.getNonce(address, 'confirmed').catch(() => null)
  if (!info) {
    const lamports = await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH)
    await sendOperatorTx(connection, op, [
      SystemProgram.createAccountWithSeed({
        fromPubkey: op.publicKey,
        basePubkey: op.publicKey,
        seed,
        newAccountPubkey: address,
        lamports,
        space: NONCE_ACCOUNT_LENGTH,
        programId: SystemProgram.programId,
      }),
      SystemProgram.nonceInitialize({ noncePubkey: address, authorizedPubkey: op.publicKey }),
    ])
    info = await connection.getNonce(address, 'confirmed')
  }
  if (!info) throw new Error('nonce account unavailable')
  return { address, value: info.nonce }
}

// ---------------------------------------------------------------------------------------------
// Token accounts the holder's transaction needs
// ---------------------------------------------------------------------------------------------

/**
 * Pull the associated-token-account creations out of `ixs`, create the missing ones with the
 * operator paying (rent on devnet), and return the remaining instructions. Keeps the holder's
 * transaction small and its simulation clean.
 */
export async function hoistAtaCreations(connection: Connection, op: Keypair, ixs: TransactionInstruction[]): Promise<TransactionInstruction[]> {
  const atas = ixs.filter((ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))
  const rest = ixs.filter((ix) => !ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))
  if (atas.length) {
    const infos = await connection.getMultipleAccountsInfo(atas.map((ix) => ix.keys[1].pubkey), 'confirmed')
    const seen = new Set<string>()
    const missing = atas
      .filter((ix, i) => !infos[i])
      .filter((ix) => (seen.has(ix.keys[1].pubkey.toBase58()) ? false : (seen.add(ix.keys[1].pubkey.toBase58()), true)))
      .map((ix) => ({ ...ix, keys: ix.keys.map((k, j) => (j === 0 ? { ...k, pubkey: op.publicKey } : k)) }) as TransactionInstruction)
    for (let i = 0; i < missing.length; i += 6) await sendOperatorTx(connection, op, missing.slice(i, i + 6))
  }
  return rest
}

// ---------------------------------------------------------------------------------------------
// The holder's transaction
// ---------------------------------------------------------------------------------------------

/** Compile [advance nonce, ...ixs] for `wallet` to sign. Never expires until the nonce advances. */
/** Confirmation strategy for a holder transaction: its nonce account and the nonce value it was built on. */
export async function nonceConfirm(connection: Connection, tx: VersionedTransaction): Promise<Confirm> {
  const ix = tx.message.compiledInstructions[0]
  const nonceAccountPubkey = tx.message.staticAccountKeys[ix.accountKeyIndexes[0]]
  const minContextSlot = await connection.getSlot('confirmed')
  return { nonceAccountPubkey, nonceValue: tx.message.recentBlockhash, minContextSlot }
}

export async function buildHolderTx(connection: Connection, op: Keypair, wallet: PublicKey, ixs: TransactionInstruction[]): Promise<VersionedTransaction> {
  const nonce = await ensureNonce(connection, op, wallet)
  const advance = SystemProgram.nonceAdvance({ noncePubkey: nonce.address, authorizedPubkey: op.publicKey })
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: wallet, recentBlockhash: nonce.value, instructions: [advance, ...ixs] }).compileToV0Message(),
  )
}

const TOKEN_TTL_MS = 15 * 60_000

function tokenKey(op: Keypair): Buffer {
  return crypto.createHash('sha256').update(Buffer.from(op.secretKey)).update('potbot-tx-token-v1').digest()
}

export interface TxTicket {
  kind: string
  wallet: string
  mint: string
  feedIds: string[]
  exp: number
}

/** Token binding the exact message bytes and what the operator must do at submit time. */
export function issueToken(op: Keypair, tx: VersionedTransaction, t: TxTicket): string {
  const body = Buffer.from(JSON.stringify(t)).toString('base64url')
  const mac = crypto.createHmac('sha256', tokenKey(op)).update(Buffer.from(tx.message.serialize())).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyToken(op: Keypair, tx: VersionedTransaction, token: string): TxTicket {
  const [body, mac] = token.split('.')
  if (!body || !mac) throw new Error('bad token')
  const want = crypto.createHmac('sha256', tokenKey(op)).update(Buffer.from(tx.message.serialize())).update(body).digest('base64url')
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) throw new Error('transaction does not match what was built')
  const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as TxTicket
  if (Date.now() > t.exp) throw new Error('this request expired, start again')
  return t
}

export function newTicket(kind: string, wallet: PublicKey, mint: PublicKey, feedIds: string[]): TxTicket {
  return { kind, wallet: wallet.toBase58(), mint: mint.toBase58(), feedIds, exp: Date.now() + TOKEN_TTL_MS }
}

// ---------------------------------------------------------------------------------------------
// Exit to USDC: the sale leg (devnet market maker)
// ---------------------------------------------------------------------------------------------

const BPS = 10_000

export async function quoteExitUsdc(pot: PotView, bal: Awaited<ReturnType<typeof fetchPotBalances>>, shares: bigint, exitFeeBps: number) {
  const prices = await fetchHermesPrices(pot.legs.map((l) => l.feedId))
  const legOut = pot.legs.map((_, i) => ((BigInt(bal.legs[i]) * shares) / BigInt(bal.supply) * BigInt(BPS - exitFeeBps)) / BigInt(BPS))
  let payUsdc = 0n
  pot.legs.forEach((l, i) => {
    const p = prices[l.feedId]?.price ?? 0
    if (p <= 0) throw new Error(`no price for leg ${i}`)
    payUsdc += BigInt(Math.floor((Number(legOut[i]) / 10 ** l.decimals) * p * 1e6))
  })
  return { legOut, payUsdc }
}

export function mmPayInstruction(op: Keypair, wallet: PublicKey, usdcMint: PublicKey, amount: bigint): TransactionInstruction[] {
  return amount > 0n ? [createMintToInstruction(usdcMint, getAssociatedTokenAddressSync(usdcMint, wallet), op.publicKey, amount)] : []
}

// ---------------------------------------------------------------------------------------------
// Cash deploy after a deposit: the operator acts as keeper
// ---------------------------------------------------------------------------------------------

const DEADBAND_BPS = 50
const MARGIN = 0.98

export async function allocateAsKeeper(connection: Connection, op: Keypair, pot: PotView, priceUpdates: PublicKey[]): Promise<string[]> {
  const usdcMint = new PublicKey(registry.usdcMint)
  const bal = await fetchPotBalances(connection, pot)
  const prices = await fetchHermesPrices(pot.legs.map((l) => l.feedId))
  const price = pot.legs.map((l) => prices[l.feedId]?.price ?? 0)
  if (price.some((p) => p <= 0)) return []
  const legUsd = pot.legs.map((l, i) => (bal.legs[i] / 10 ** l.decimals) * price[i] * 1e6)
  let cash = bal.cash
  const nav = cash + legUsd.reduce((s, v) => s + v, 0)
  if (nav <= 0) return []
  const maxTrade = (nav * pot.maxTradeBps) / BPS
  const deadband = (nav * DEADBAND_BPS) / BPS
  const plan: { leg: number; amountOut: number; amountIn: number }[] = []
  for (let pass = 0; pass < 4 && cash >= deadband; pass++) {
    const order = pot.legs
      .map((l, i) => ({ i, gap: (nav * l.weightBps) / BPS - legUsd[i] }))
      .filter((g) => g.gap > 0)
      .sort((a, b) => b.gap - a.gap)
    let moved = false
    for (const { i, gap } of order) {
      if (cash < deadband) break
      const tradeUsd = Math.floor(Math.min(gap, cash, maxTrade) * MARGIN)
      if (tradeUsd < 500_000) continue
      const amountIn = Math.floor((tradeUsd / 1e6 / price[i]) * 10 ** pot.legs[i].decimals)
      if (amountIn <= 0) continue
      plan.push({ leg: i, amountOut: tradeUsd, amountIn })
      cash -= tradeUsd
      legUsd[i] += tradeUsd
      moved = true
    }
    if (!moved) break
  }
  if (!plan.length) return []
  const program = potProgram(connection, op.publicKey)
  const opUsdc = getAssociatedTokenAddressSync(usdcMint, op.publicKey)
  const sigs: string[] = []
  // Sequential: each trade changes the weights the next one is checked against.
  for (const p of plan) {
    const leg = pot.legs[p.leg]
    const { open, close } = await buildRebalancePair(program, { pot, keeper: op.publicKey, usdcMint, legOut: CASH_LEG, legIn: p.leg, amountOut: p.amountOut, priceUpdates })
    try {
      sigs.push(
        await sendOperatorTx(connection, op, [
          createAssociatedTokenAccountIdempotentInstruction(op.publicKey, opUsdc, op.publicKey, usdcMint),
          open,
          // the Pot hands the cash to the keeper (operator) and the operator fills the vault (devnet: minted)
          createMintToInstruction(leg.mint, leg.vault, op.publicKey, BigInt(p.amountIn)),
          close,
        ]),
      )
    } catch {
      break // bounds moved (another deposit, cooldown); keepers will finish the rest
    }
  }
  return sigs
}
