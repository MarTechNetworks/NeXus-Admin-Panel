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
 * ── Where a display name comes from ──────────────────────────────────────────────
 * Each metadata file declares its own name: `0.json` is `{"name":"2030",…}`. That
 * pairing *is* the collection — image, traits and number were fixed together when the
 * art was generated. So an unminted file's name is read out of that file and nowhere
 * else.
 *
 * This script used to pair the sorted unminted files with the sorted *unused numbers*,
 * assuming the leftovers on each side lined up. They do not: the reveal was shuffled, so
 * leftover file 1405 and leftover number "50" have nothing to do with each other. The
 * result was 6,214 entries whose on-chain name contradicted the name inside the very
 * JSON the asset points at, with the range shifted on top of it (a "#0" that does not
 * exist in the collection, and no "#7575"). Nothing collided with the 1,361 already
 * minted, so it would not have failed — it would have quietly shipped 6,214 NFTs whose
 * number belonged to someone else's artwork.
 *
 * Names now come from the files, and `main()` proves the rule against all 1,361
 * already-minted assets before writing anything.
 *
 * Usage:  node scripts/guardianz-snapshot.mjs [--no-shuffle]
 *         GUARDIANZ_METADATA_DIR=D:/backups/guardianz/metadata node scripts/guardianz-snapshot.mjs
 * Output: src/lib/guardianz/data/snapshot.json
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises'
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

/**
 * Where to read the 7,575 names from.
 *
 * `GUARDIANZ_METADATA_DIR` points at a local copy of the metadata folder — the
 * off-chain backup at D:/backups/guardianz/metadata is exactly that, verified
 * byte-for-byte against the gateway. Using it turns 7,575 HTTP round-trips into 7,575
 * local reads, which is the difference between a minute and a second, and works when
 * pinit.io is throttling or gone. Without it the files are fetched from the gateway.
 */
const METADATA_DIR = process.env.GUARDIANZ_METADATA_DIR ?? ''
const METADATA_BASE =
  process.env.GUARDIANZ_METADATA_BASE ??
  'https://gateway.pinit.io/ipfs/QmQ83S7wpaUikQW3mj1EesMcharfnfKCJ72SReyEQ22FnA'
/** Parallel gateway reads. Enough to be quick, few enough to stay polite. */
const FETCH_CONCURRENCY = 24

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
 * Every file's declared name, indexed by file number: `names[0] === '2030'`.
 *
 * The value used is the JSON's own `name` field — the number the art generator wrote
 * alongside that image's traits. Nothing is derived from the file index, because the
 * reveal was shuffled and the two are unrelated.
 */
async function readNames() {
  const names = new Array(TOTAL_SUPPLY)

  if (METADATA_DIR) {
    console.log(`reading ${TOTAL_SUPPLY} names from ${METADATA_DIR}`)
    for (let i = 0; i < TOTAL_SUPPLY; i++) {
      names[i] = String(JSON.parse(await readFile(resolve(METADATA_DIR, `${i}.json`), 'utf8')).name)
    }
    return names
  }

  console.log(`fetching ${TOTAL_SUPPLY} names from ${METADATA_BASE} (${FETCH_CONCURRENCY} at a time)`)
  let cursor = 0
  await Promise.all(
    Array.from({ length: FETCH_CONCURRENCY }, async () => {
      for (let i = cursor++; i < TOTAL_SUPPLY; i = cursor++) {
        const res = await fetch(`${METADATA_BASE}/${i}.json`)
        if (!res.ok) throw new Error(`${i}.json → HTTP ${res.status}`)
        names[i] = String((await res.json()).name)
      }
    }),
  )
  return names
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

  const mintedNames = new Set(minted.values())
  const unmintedIndices = []
  for (let i = 0; i < TOTAL_SUPPLY; i++) if (!minted.has(i)) unmintedIndices.push(i)

  const nameByFile = await readNames()

  // Prove the rule before trusting it.
  //
  // Every asset LaunchMyNFT minted should carry the name declared inside the JSON it
  // points at. If that holds for all 1,361, then it is demonstrably the rule the
  // original mint followed, and applying it to the remaining 6,214 continues the same
  // collection instead of inventing a second numbering. If it does not hold, the
  // assumption behind this whole file is wrong and a snapshot built on it must not
  // reach the chain — so this throws rather than warns.
  const nameMismatches = []
  for (const [fileIndex, onChainName] of minted) {
    if (nameByFile[fileIndex] !== onChainName) {
      nameMismatches.push({ fileIndex, onChain: onChainName, json: nameByFile[fileIndex] })
    }
  }
  if (nameMismatches.length > 0) {
    console.log(`✗ ${nameMismatches.length} of ${minted.size} minted assets do not carry their own JSON's name:`)
    for (const m of nameMismatches.slice(0, 10)) {
      console.log(`   ${m.fileIndex}.json → on-chain "${m.onChain}", json "${m.json}"`)
    }
    throw new Error('the name rule does not hold on the minted set — refusing to write a snapshot')
  }
  console.log(`✓ all ${minted.size} minted assets carry their own JSON's name`)

  // Each unminted file keeps the name its own JSON declares. Then shuffle the pairs so
  // the pool is not in file order — belt and braces, since the candy machine also picks
  // at random, but a shuffled pool means even the upload order reveals nothing.
  let entries = unmintedIndices.map(fileIndex => ({ fileIndex, name: nameByFile[fileIndex] }))

  // Three ways this could still be wrong, each fatal on-chain and silent off it.
  const nameless = entries.filter(e => e.name == null || e.name === '')
  if (nameless.length > 0) {
    throw new Error(`${nameless.length} unminted files declare no name (first: ${nameless[0].fileIndex}.json)`)
  }
  const distinct = new Set(entries.map(e => e.name)).size
  if (distinct !== entries.length) {
    throw new Error(`${entries.length - distinct} duplicate names in the pool — two files declare the same number`)
  }
  const clashes = entries.filter(e => mintedNames.has(e.name))
  if (clashes.length > 0) {
    throw new Error(
      `${clashes.length} pool names are already minted (first "${clashes[0].name}") — would mint a duplicate number`,
    )
  }

  if (SHUFFLE) entries = shuffle(entries, COLLECTION)

  const snapshot = {
    takenAt: new Date().toISOString(),
    collection: COLLECTION,
    rpc: RPC,
    totalSupply: TOTAL_SUPPLY,
    mintedCount: minted.size,
    unmintedCount: entries.length,
    shuffled: SHUFFLE,
    /** Where each entry's name came from, and that it was checked against the minted set. */
    nameSource: METADATA_DIR || METADATA_BASE,
    nameRuleVerifiedAgainstMinted: minted.size,
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
