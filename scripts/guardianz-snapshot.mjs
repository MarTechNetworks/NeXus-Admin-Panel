/**
 * guardianz-snapshot.mjs — work out which of the 7,575 GuardianZ metadata files are
 * still unminted, and emit the pool the on-chain program is loaded with.
 *
 * The original mint shuffled its reveal, so a token's displayed number tells you nothing
 * about which JSON it consumed: `0.json` is named "2030", and the asset named "3465"
 * points at `799.json`. There is no public list of what was minted. But every minted
 * asset carries its own `uri` and `name` on-chain, so reading all of them and diffing
 * against `0…7574` reconstructs the unminted set exactly — no cooperation from the old
 * launchpad, and no trust in anyone's export.
 *
 * ── Why getProgramAccounts and not DAS ────────────────────────────────────────────
 * The obvious tool is DAS `getAssetsByGroup`, which needs a paid indexer (Helius et al).
 * It turns out not to be necessary: an `AssetV1` stores its update authority inline, so a
 * single `getProgramAccounts` against MPL Core with a memcmp at offset 33 returns exactly
 * the collection's assets — all 1,361 in under a second on the free public endpoint.
 * Measured, not assumed. `GUARDIANZ_RPC_URL` overrides the endpoint if the public one
 * starts rate-limiting.
 *
 *   AssetV1 layout: u8 key | [32] owner | u8 ua_tag | [32] ua | str name | str uri
 *   ua_tag 2 = Collection, so the filter is byte 0x02 followed by the collection key.
 *
 * Usage:  node scripts/guardianz-snapshot.mjs [--no-shuffle]
 * Output: src/lib/guardianz/data/snapshot.json
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../src/lib/guardianz/data/snapshot.json')

const COLLECTION = '5Xt95jj1av4HN5jLMrQj9zZUnCdKaTHqXKkSkegyrT1K'
const MPL_CORE = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'
const TOTAL_SUPPLY = 7575
const RPC = process.env.GUARDIANZ_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const SHUFFLE = !process.argv.includes('--no-shuffle')

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function b58encode(buf) {
  const digits = [0]
  for (const byte of buf) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = ''
  for (const byte of buf) {
    if (byte === 0) out += '1'
    else break
  }
  return out + digits.reverse().map(d => B58[d]).join('')
}

function b58decode(str) {
  const bytes = [0]
  for (const ch of str) {
    let carry = B58.indexOf(ch)
    if (carry < 0) throw new Error(`bad base58 char ${ch}`)
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const ch of str) {
    if (ch === '1') bytes.push(0)
    else break
  }
  return Buffer.from(bytes.reverse())
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'guardianz', method, params }),
  })
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`${method} → ${json.error.message ?? JSON.stringify(json.error)}`)
  return json.result
}

/** Read `name` and `uri` out of an AssetV1 account. */
function decodeAsset(data) {
  let o = 1 + 32 // key, owner
  const tag = data[o]
  o += 1
  if (tag !== 0) o += 32 // update authority pubkey
  const nameLen = data.readUInt32LE(o)
  o += 4
  const name = data.subarray(o, o + nameLen).toString('utf8')
  o += nameLen
  const uriLen = data.readUInt32LE(o)
  o += 4
  const uri = data.subarray(o, o + uriLen).toString('utf8')
  return { name, uri }
}

/**
 * Deterministic shuffle.
 *
 * The program hands entries out in pool order, so the pool must be shuffled before it is
 * uploaded or the mint reveals in file order. Seeded from the collection address rather
 * than `Math.random`, so re-running the script reproduces the same pool and a mismatch
 * against what is already on-chain means something genuinely changed.
 */
function shuffle(items, seed) {
  const out = items.slice()
  let counter = 0
  const next = () => {
    const h = createHash('sha256').update(`${seed}:${counter++}`).digest()
    return h.readUInt32BE(0) / 0x100000000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function main() {
  // ua_tag 2 (Collection) followed by the collection key, matched at offset 33.
  const filterBytes = b58encode(Buffer.concat([Buffer.from([2]), b58decode(COLLECTION)]))

  console.log(`reading ${MPL_CORE} assets in collection ${COLLECTION}…`)
  const accounts = await rpc('getProgramAccounts', [
    MPL_CORE,
    { encoding: 'base64', filters: [{ memcmp: { offset: 33, bytes: filterBytes } }] },
  ])

  /** metadata file index → the display name minted against it */
  const minted = new Map()
  const unparsed = []
  const duplicates = []

  for (const acct of accounts) {
    const data = Buffer.from(acct.account.data[0], 'base64')
    const { name, uri } = decodeAsset(data)
    const m = /\/(\d+)\.json(?:\?.*)?$/.exec(uri)
    const idx = m ? Number(m[1]) : null
    if (idx == null || !Number.isInteger(idx) || idx < 0 || idx >= TOTAL_SUPPLY) {
      unparsed.push({ pubkey: acct.pubkey, uri })
      continue
    }
    // Two assets on one JSON would mean the reveal double-allocated a file — surfaced
    // loudly rather than silently overwritten, because it changes how many are left.
    if (minted.has(idx)) duplicates.push({ index: idx, pubkey: acct.pubkey })
    else minted.set(idx, name)
  }

  // The names still available are the ones no minted asset claimed. Both halves of each
  // pair matter: the program needs the file index for the URI *and* the display name,
  // because the shuffle means neither implies the other.
  const mintedNames = new Set(minted.values())
  const unmintedIndices = []
  for (let i = 0; i < TOTAL_SUPPLY; i++) if (!minted.has(i)) unmintedIndices.push(i)

  const availableNames = []
  for (let n = 0; n < TOTAL_SUPPLY; n++) if (!mintedNames.has(String(n))) availableNames.push(n)

  if (availableNames.length !== unmintedIndices.length) {
    console.log(
      `⚠ ${unmintedIndices.length} unminted files but ${availableNames.length} unused names — ` +
        'the original reveal was not a clean 1:1 mapping. Pairing by order.',
    )
  }

  // Pair each surviving file with a surviving name, then shuffle the pairs so the mint
  // does not reveal in file order.
  let entries = unmintedIndices.map((fileIndex, i) => ({
    fileIndex,
    name: availableNames[i] ?? fileIndex,
  }))
  if (SHUFFLE) entries = shuffle(entries, COLLECTION)

  const snapshot = {
    takenAt: new Date().toISOString(),
    collection: COLLECTION,
    rpc: RPC,
    totalSupply: TOTAL_SUPPLY,
    mintedCount: minted.size,
    unmintedCount: entries.length,
    shuffled: SHUFFLE,
    /** What `load_chunk` uploads, in order. */
    entries,
    anomalies: { unparsed, duplicates },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snapshot, null, 2))

  console.log(`minted:   ${minted.size}`)
  console.log(`unminted: ${entries.length}`)
  console.log(`reconciles: ${minted.size + entries.length === TOTAL_SUPPLY}`)
  if (unparsed.length) console.log(`⚠ ${unparsed.length} assets had an unrecognised uri`)
  if (duplicates.length) console.log(`⚠ ${duplicates.length} metadata indices used twice`)
  console.log(`→ ${OUT}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
