/**
 * Drive the one-signature flows exactly as the browser does:
 *   npx tsx scripts/pot-index-operator-flow.ts deposit <mint> <usdc> [--base <url>]
 *   npx tsx scripts/pot-index-operator-flow.ts exit <mint> <shares base units>
 *   npx tsx scripts/pot-index-operator-flow.ts exit-usdc <mint> <shares base units>
 *   npx tsx scripts/pot-index-operator-flow.ts faucet
 * Wallet: $POT_INDEX_WALLET_KEYPAIR (default ~/.config/solana/id.json). Base: $POT_INDEX_BASE_URL or --base.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Keypair, VersionedTransaction } from '@solana/web3.js'

const KEYPAIR = process.env.POT_INDEX_WALLET_KEYPAIR ?? path.join(os.homedir(), '.config/solana/id.json')
const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base')
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : (process.env.POT_INDEX_BASE_URL ?? 'http://localhost:3000')
const pos = args.filter((a, i) => a !== '--base' && (baseIdx < 0 || i !== baseIdx + 1))

async function post(route: string, body: unknown) {
  const r = await fetch(`${BASE}/api/pot-index/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json()) as Record<string, unknown>
  if (!r.ok) throw new Error(`${route}: ${r.status} ${JSON.stringify(j)}`)
  return j
}

async function main() {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, 'utf8'))))
  const wallet = kp.publicKey.toBase58()
  const [cmd, mint, amt] = pos
  console.log('wallet', wallet, 'base', BASE)
  if (cmd === 'faucet') return console.log(await post('faucet', { wallet }))
  const body = cmd === 'deposit' ? { kind: 'deposit', wallet, mint, amountUsdc: Number(amt) } : cmd === 'exit' ? { kind: 'exit', wallet, mint, shares: Number(amt) } : cmd === 'exit-usdc' ? { kind: 'exit-usdc', wallet, mint, shares: amt } : null
  if (!body) throw new Error('unknown command')
  let t = Date.now()
  const built = await post('tx/build', body)
  console.log(`build ${Date.now() - t} ms`, built.payUsdc ? `pay ${Number(built.payUsdc) / 1e6} USDC` : '')
  const tx = VersionedTransaction.deserialize(Buffer.from(built.tx as string, 'base64'))
  tx.sign([kp])
  const wait = Number(process.env.SIGN_DELAY_SECS ?? 0)
  if (wait) {
    console.log(`sleeping ${wait} s to imitate a slow wallet`)
    await new Promise((r) => setTimeout(r, wait * 1000))
  }
  t = Date.now()
  const res = await post('tx/submit', { tx: Buffer.from(tx.serialize()).toString('base64'), token: built.token })
  console.log(`submit ${Date.now() - t} ms`, res.sig, 'allocated', (res.allocated as string[] | undefined)?.length ?? 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
