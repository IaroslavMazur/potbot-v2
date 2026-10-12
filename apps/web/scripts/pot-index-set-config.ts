/**
 * Admin: update protocol config on devnet.
 *
 *   npx tsx scripts/pot-index-set-config.ts price-age 30     # max_price_age_secs (cap: 60)
 *   npx tsx scripts/pot-index-set-config.ts show
 *
 * Signer: $POT_INDEX_ADMIN_KEYPAIR (default ~/.config/solana/id.json), must be config.admin.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AnchorProvider, BN, Program, Wallet, type Idl } from '@coral-xyz/anchor'
import { Connection, Keypair } from '@solana/web3.js'
import idl from '../src/lib/pot-index/idl.json'
import { configPda, fetchConfig } from '../src/lib/pot-index/client'

const RPC = process.env.POT_INDEX_RPC ?? 'https://api.devnet.solana.com'
const KEYPAIR = process.env.POT_INDEX_ADMIN_KEYPAIR ?? path.join(os.homedir(), '.config/solana/id.json')

async function main() {
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, 'utf8'))))
  const connection = new Connection(RPC, 'confirmed')
  const program = new Program(idl as Idl, new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' }))
  const [cmd, arg] = process.argv.slice(2)
  const show = async () => {
    const c = await fetchConfig(connection)
    console.log({ admin: c.admin.toBase58(), paused: c.paused, maxPriceAgeSecs: Number(c.maxPriceAgeSecs), treasury: c.treasury.toBase58(), potCount: Number(c.potCount) })
  }
  if (cmd === 'show' || !cmd) return show()
  if (cmd === 'price-age') {
    const secs = Number(arg)
    if (!(secs > 0 && secs <= 60)) throw new Error('price-age must be 1..60 seconds')
    const sig = await program.methods
      .setConfig({ paused: null, maxPriceAgeSecs: new BN(secs), treasury: null, newAdmin: null })
      .accounts({ admin: admin.publicKey, config: configPda() })
      .rpc()
    console.log('set max_price_age_secs =', secs, sig)
    return show()
  }
  throw new Error('usage: show | price-age <secs>')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
