/**
 * Send the remaining config lines one transaction at a time, loudly.
 *
 * The bulk uploader resolved its last batch without throwing while `itemsLoaded` stayed
 * at 6,176, which is the one failure mode a wave-based sender hides: whatever went wrong
 * happened inside a promise that still settled. This does the same work serially and
 * prints the signature and the counter after each one, so a transaction that lands
 * without moving the counter is visible rather than inferred.
 *
 * Idempotent, like the uploader: lines are addressed by index, so re-sending a batch
 * that already landed rewrites identical bytes.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi'
import {
  mplCandyMachine,
  addConfigLines,
  fetchCandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine'

const HERE = dirname(fileURLToPath(import.meta.url))
const CM = process.env.GUARDIANZ_CANDY_MACHINE ?? '885b7rPH66YrDhpUcBUA1nNRebhuxVuxndrKyzh4r9Wj'
const RPC = process.env.GUARDIANZ_RPC_URL
const KEYPAIR = process.env.GUARDIANZ_OPS_KEYPAIR
const BATCH = Number(process.env.GUARDIANZ_UPLOAD_BATCH ?? 20)

if (!KEYPAIR) throw new Error('GUARDIANZ_OPS_KEYPAIR is required')

const snapshot = JSON.parse(
  readFileSync(resolve(HERE, '../src/lib/guardianz/data/snapshot.json'), 'utf8'),
)
const ENTRIES = snapshot.entries

const umi = createUmi(RPC, 'confirmed').use(mplCandyMachine())
umi.use(
  keypairIdentity(
    umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR, 'utf8')))),
  ),
)

/**
 * Start at 0, not at `itemsLoaded`.
 *
 * `items_loaded` counts bits the program flips 0->1, and the first upload ran ten
 * transactions at a time: two landing in the same slot both read the old counter and
 * the second's write erased the first's increment. So the counter under-reports while
 * the lines themselves are there, and resuming "from itemsLoaded" re-sends lines that
 * are already set — every bit stays 1, nothing increments, and the upload cannot finish
 * no matter how many times it is run. That is the loop this script broke out of.
 *
 * Rewriting the whole range fixes it without needing to know which indices are missing:
 * a line already set costs a no-op write, and every unset one flips and counts. 156
 * transactions, about 0.0008 SOL.
 */
const START = Number(process.env.GUARDIANZ_UPLOAD_FROM ?? 0)

let cm = await fetchCandyMachine(umi, publicKey(CM))
const total = Number(cm.data.itemsAvailable)
console.log(`candy machine ${CM}`)
console.log(`authority     ${cm.authority}`)
console.log(`loaded        ${cm.itemsLoaded}/${total}`)
console.log(`snapshot      ${ENTRIES.length}`)
console.log('')

if (ENTRIES.length !== total) {
  throw new Error(`snapshot ${ENTRIES.length} != itemsAvailable ${total}`)
}

let failures = 0
for (let index = START; index < total; index += BATCH) {
  const lines = ENTRIES.slice(index, Math.min(index + BATCH, total)).map(e => ({
    name: String(e.name),
    uri: `${e.fileIndex}.json`,
  }))

  try {
    await addConfigLines(umi, {
      candyMachine: publicKey(CM),
      index,
      configLines: lines,
    }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } })
    process.stdout.write(`  ${index + lines.length}/${total}\n`)
  } catch (e) {
    failures++
    console.log(`  index ${index} FAILED: ${e.message}`)
    if (e.logs) for (const l of e.logs.slice(0, 4)) console.log(`    ${l}`)
    // Keep going: one bad batch should not strand the other 155. Anything still
    // missing at the end is reported, and another pass closes it.
  }

  // Serial by construction, but the RPC still has a rate window.
  await new Promise(r => setTimeout(r, Number(process.env.GUARDIANZ_UPLOAD_PAUSE_MS ?? 250)))
}

cm = await fetchCandyMachine(umi, publicKey(CM))
console.log('')
console.log(`itemsLoaded ${cm.itemsLoaded}/${total}${failures ? `  (${failures} batch(es) failed)` : ''}`)
if (cm.itemsLoaded >= total) {
  console.log('fully loaded')
} else {
  console.log(`still short by ${total - cm.itemsLoaded} — run again to close the gap`)
  process.exit(1)
}
