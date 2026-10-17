/**
 * guardianz-upload.mjs — load the remaining (name, file) pairs into the candy machine.
 *
 * Our half of the setup. After the creator has signed the candy machine into existence
 * from /guardianz/admin, this uploads every entry from the snapshot as a config line,
 * signed by the ops wallet (the candy machine's `authority`). Idempotent: it reads
 * `itemsLoaded` first and resumes from there, so a crash halfway through is a re-run,
 * not a mess.
 *
 * Usage:
 *   GUARDIANZ_OPS_KEYPAIR=path/to/ops.json \
 *   GUARDIANZ_RPC_URL=https://... \
 *     node scripts/guardianz-upload.mjs
 *
 * The candy machine is found on-chain by collection, not configured — same lookup the
 * pages use. Pass GUARDIANZ_CANDY_MACHINE=<address> to pin one explicitly.
 *
 * Sends in waves and confirms the on-chain counter at the end, which is the only proof
 * that matters. Rehearsed in programs/tests/guardianz-candy-machine.test.mjs step 3.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi'
import { mplCore } from '@metaplex-foundation/mpl-core'
import {
  mplCandyMachine,
  addConfigLines,
  fetchCandyMachine,
  getCandyMachineGpaBuilder,
} from '@metaplex-foundation/mpl-core-candy-machine'

const HERE = dirname(fileURLToPath(import.meta.url))
const COLLECTION = '5Xt95jj1av4HN5jLMrQj9zZUnCdKaTHqXKkSkegyrT1K'
const RPC = process.env.GUARDIANZ_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const KEYPAIR = process.env.GUARDIANZ_OPS_KEYPAIR
const PINNED = process.env.GUARDIANZ_CANDY_MACHINE

if (!KEYPAIR) {
  console.error('GUARDIANZ_OPS_KEYPAIR is required — the ops wallet that is the candy machine authority.')
  process.exit(1)
}

const snapshot = JSON.parse(readFileSync(resolve(HERE, '../src/lib/guardianz/data/snapshot.json'), 'utf8'))
const ENTRIES = snapshot.entries
/** Config lines per transaction. 40 is what fits in 1,232 bytes alongside the rest. */
const BATCH = Number(process.env.GUARDIANZ_UPLOAD_BATCH ?? 40)

/**
 * Transactions sent at once.
 *
 * Was a flat 10, which a free-tier RPC answers with a wall of 429s: the first run got
 * 240 of them, the SDK's backoff could not keep up, and the script died at 4,760 of
 * 6,216. Resuming costs nothing (lines are written by index, so a re-run starts at
 * `itemsLoaded`), but finishing in one pass is better than discovering the limit twice.
 * Lower it further on a free key; raise it on a paid one.
 */
const WAVE = Number(process.env.GUARDIANZ_UPLOAD_WAVE ?? 3)

/** Pause between waves. Nothing is racing; the RPC's rate window is the only clock. */
const WAVE_PAUSE_MS = Number(process.env.GUARDIANZ_UPLOAD_PAUSE_MS ?? 400)

const umi = createUmi(RPC, 'confirmed').use(mplCore()).use(mplCandyMachine())
const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR, 'utf8'))))
umi.use(keypairIdentity(kp))

async function main() {
  let cmAddress = PINNED
  if (!cmAddress) {
    const all = await getCandyMachineGpaBuilder(umi)
      .whereField('collectionMint', publicKey(COLLECTION))
      .getDeserialized()
    if (all.length === 0) throw new Error('No candy machine exists for the collection yet — the creator signs step 2 first.')
    cmAddress = all.sort((a, b) => b.itemsLoaded - a.itemsLoaded)[0].publicKey
  }

  let cm = await fetchCandyMachine(umi, publicKey(cmAddress))
  const total = Number(cm.data.itemsAvailable)
  console.log(`candy machine ${cmAddress}`)
  console.log(`authority ${cm.authority}${cm.authority === kp.publicKey ? ' (this wallet)' : '  ⚠ NOT this wallet'}`)
  console.log(`items ${cm.itemsLoaded}/${total} loaded, snapshot has ${ENTRIES.length}`)

  if (cm.authority !== kp.publicKey) throw new Error('This wallet is not the candy machine authority.')
  if (ENTRIES.length !== total) {
    throw new Error(`Snapshot (${ENTRIES.length}) does not match itemsAvailable (${total}). Re-run the snapshot or recreate the candy machine.`)
  }
  if (cm.itemsLoaded >= total) {
    console.log('already fully loaded — nothing to do')
    return
  }

  // Config lines are written by index, so resuming is just starting at itemsLoaded.
  const batches = []
  for (let i = cm.itemsLoaded; i < total; i += BATCH) {
    batches.push({
      index: i,
      lines: ENTRIES.slice(i, i + BATCH).map(e => ({ name: String(e.name), uri: `${e.fileIndex}.json` })),
    })
  }
  console.log(`uploading ${batches.length} batches of ≤${BATCH}…`)

  const t0 = Date.now()
  for (let w = 0; w < batches.length; w += WAVE) {
    const wave = batches.slice(w, w + WAVE)
    await Promise.all(
      wave.map(b =>
        addConfigLines(umi, { candyMachine: publicKey(cmAddress), index: b.index, configLines: b.lines })
          .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } }),
      ),
    )
    process.stdout.write(`  ${Math.min(w + WAVE, batches.length)}/${batches.length}\n`)
    if (WAVE_PAUSE_MS > 0 && w + WAVE < batches.length) {
      await new Promise(r => setTimeout(r, WAVE_PAUSE_MS))
    }
  }
  process.stdout.write('\n')

  cm = await fetchCandyMachine(umi, publicKey(cmAddress))
  const ok = cm.itemsLoaded >= total
  console.log(`${ok ? '✓' : '✗'} itemsLoaded ${cm.itemsLoaded}/${total} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  if (!ok) process.exit(1)
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
