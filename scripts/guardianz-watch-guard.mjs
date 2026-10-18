/**
 * Watch the GuardianZ candy guard and print every change to its groups.
 *
 * Exists because the admin UI cannot be trusted to report what reached the chain — a
 * save has already landed while the page showed a red error, and a save has already
 * written stale content while the page showed what the operator expected. The guard
 * account is the only thing that knows, so this reads it directly and says what changed.
 *
 * Usage:  node --env-file=.env scripts/guardianz-watch-guard.mjs [minutes]
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { publicKey } from '@metaplex-foundation/umi'
import {
  mplCandyMachine,
  fetchCandyMachine,
  safeFetchCandyGuard,
} from '@metaplex-foundation/mpl-core-candy-machine'

const CM = process.env.GUARDIANZ_CANDY_MACHINE ?? '885b7rPH66YrDhpUcBUA1nNRebhuxVuxndrKyzh4r9Wj'
const MINUTES = Number(process.argv[2] ?? 15)
const POLL_MS = 15_000

const umi = createUmi(process.env.GUARDIANZ_RPC_URL, 'confirmed').use(mplCandyMachine())

/** One line per group, in a shape that is stable to compare and readable to a person. */
function describe(guard) {
  if (!guard) return ['(no guard)']
  if (guard.groups.length === 0) return ['(no groups — flat default guard set)']
  const now = Math.floor(Date.now() / 1000)
  return guard.groups.map(g => {
    const bits = []
    const p = g.guards.solPayment
    bits.push(
      p?.__option === 'Some' ? `${Number(p.value.lamports.basisPoints) / 1e9} SOL` : 'free',
    )
    const s = g.guards.startDate
    if (s?.__option === 'Some') {
      const t = Number(s.value.date)
      bits.push(`starts ${new Date(t * 1000).toISOString()}${t <= now ? ' (open)' : ' (not yet)'}`)
    } else bits.push('always open')
    const e = g.guards.endDate
    if (e?.__option === 'Some') bits.push(`ends ${new Date(Number(e.value.date) * 1000).toISOString()}`)
    const m = g.guards.mintLimit
    if (m?.__option === 'Some') bits.push(`max ${m.value.limit}/wallet (id ${m.value.id})`)
    const a = g.guards.allowList
    if (a?.__option === 'Some') bits.push('whitelisted')
    return `"${g.label}"  ${bits.join(' · ')}`
  })
}

const cm = await fetchCandyMachine(umi, publicKey(CM))
let previous = null
const until = Date.now() + MINUTES * 60_000

console.log(`watching ${CM} for ${MINUTES} minutes — redeemed ${Number(cm.itemsRedeemed)}`)
console.log('')

while (Date.now() < until) {
  let lines
  try {
    const guard = await safeFetchCandyGuard(umi, cm.mintAuthority)
    lines = describe(guard)
  } catch (e) {
    // A failed read says nothing about the chain. Keep watching.
    await new Promise(r => setTimeout(r, POLL_MS))
    continue
  }

  const snapshot = lines.join('\n')
  if (snapshot !== previous) {
    console.log(`[${new Date().toISOString()}] ${previous === null ? 'current' : 'CHANGED'}:`)
    for (const l of lines) console.log('   ', l)
    console.log('')
    previous = snapshot
  }

  await new Promise(r => setTimeout(r, POLL_MS))
}

console.log('watch window ended')
