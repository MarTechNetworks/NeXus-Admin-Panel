/**
 * Mint phases for GuardianZ, as Candy Guard **guard groups**.
 *
 * A group is a named set of guards, and the buyer names one by `label` when minting —
 * so groups are concurrent windows, not steps in a queue, exactly like the launchpad's
 * own phases (CLAUDE.md §5.5.1). Two groups may be live at once and the buyer picks.
 *
 * Everything here is edited and sent live: `updateCandyGuard` rewrites the whole guard
 * config in one transaction, takes effect on the next mint, and needs no redeploy and no
 * signature from the collection creator. That is what makes a phase editor in the admin
 * panel possible at all.
 *
 * ── Who signs ─────────────────────────────────────────────────────────────────────
 * `updateCandyGuard` is signed by the **candy guard's** authority, which is a different
 * account from the candy machine's (`setCandyGuardAuthority` vs `setCandyMachineAuthority`).
 * They are deliberately allowed to diverge: the machine authority does the 156 scripted
 * `addConfigLines` uploads from a keypair on a USB stick, while the guard authority is a
 * wallet someone can actually connect in a browser. Read it off-chain and gate the UI on
 * it rather than assuming — see `guardAuthority`.
 *
 * ── The five gotchas ──────────────────────────────────────────────────────────────
 * 1. `label` is capped at 6 bytes by the program. Longer labels do not truncate, they
 *    fail the transaction. The buyer-visible name lives off-chain (`displayName`) because
 *    six bytes is not a name.
 * 2. `mintLimit.id` is the key the per-wallet counter PDA is derived from. Reusing an id
 *    with a different limit keeps everyone's existing count; changing the id resets every
 *    buyer to zero. So an id read off the chain is **carried on the draft** and written
 *    back unchanged — deleting phase 2 must not silently reset phase 3's counters, which
 *    is exactly what pinning ids to the array index would do.
 * 3. `allowList` puts only a merkle root on chain. Buyers compute their own proof, so the
 *    wallet list has to be readable by the mint page — it is saved to the backend sidecar
 *    (`/api/guardianz/config`) keyed by the root it produced, and the root is what proves
 *    the list was not swapped afterwards.
 * 4. An empty `groups` array is not "no phases", it is "use the default guard set". The
 *    two are different on-chain states and the editor has to say which it means.
 * 5. The default guard set is emptied on save. With groups present, Candy Guard requires
 *    the buyer to name one, and any guard left in the default set applies *on top* of the
 *    chosen group — a stray `solPayment` there would charge every buyer twice.
 */
import {
  getMerkleRoot,
  updateCandyGuard,
  type CandyGuard,
  type DefaultGuardSetArgs,
  type GuardGroupArgs,
} from '@metaplex-foundation/mpl-core-candy-machine'
import {
  dateTime,
  none,
  publicKey,
  some,
  sol,
  type Umi,
} from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'

import { CREATOR_WALLET } from '@/lib/guardianz/constants'

/** The program's hard cap on a group label. Six bytes, not six characters. */
export const LABEL_MAX_BYTES = 6

/** `mintLimit.id` is a u8 on chain, so there are 256 independent counter namespaces. */
export const MAX_MINT_LIMIT_ID = 255

/** Matches the backend sidecar's column widths (`guardianz_phase_meta`). */
export const DISPLAY_NAME_MAX = 64
export const DESCRIPTION_MAX = 500

/**
 * One phase, in the shape the form holds it.
 *
 * Every chain-bound field is a string because that is what an input gives you, and
 * because empty string is the only honest way to spell "this guard is absent" — `0` means
 * a real zero price and `null` would need a second flag per field. Conversion and the
 * "absent vs zero" decision happen once, in `toGuardGroup`.
 */
export interface PhaseDraft {
  /** Local only — React key and stable identity while editing. Never sent on-chain. */
  key: string
  /** The on-chain identifier the buyer's mint names. ≤6 bytes, unique. */
  label: string
  /** Buyer-visible name, stored off-chain. Empty falls back to `label` on the mint page. */
  displayName: string
  /** One or two sentences shown under the phase tab. Off-chain. */
  description: string
  /** ISO local datetime (`datetime-local` input). Empty = open from the start. */
  startsAt: string
  /** ISO local datetime. Empty = open-ended, runs until the collection ends. */
  endsAt: string
  /** Price in SOL as typed. Empty or `0` = free mint (no solPayment guard). */
  priceSol: string
  /** Max mints per wallet in this phase. Empty = unlimited (no mintLimit guard). */
  maxPerWallet: string
  /** Wallets, one per line or comma-separated. Empty = public phase (no allowList). */
  allowlistRaw: string
  /**
   * The `mintLimit.id` this phase already uses on chain, if it came from there.
   * Carried through a save untouched — see gotcha 2. Undefined on a new phase, which
   * `savePhases` then allocates an unused id for.
   */
  mintLimitId?: number
  /**
   * Set when the chain has an allowlist root for this phase whose wallet list the sidecar
   * does not hold. The root is preserved through a save so an editor that cannot show the
   * list cannot quietly turn a whitelisted phase public — but nobody can mint the phase
   * until the list is re-pasted, because proofs are built from the list.
   */
  unknownRootHex?: string
  /**
   * True when `label` was read off the chain, so it must not be re-derived.
   *
   * A label is a phase's on-chain identity: renaming one rewrites the group a buyer's
   * transaction names, and anyone sitting on an open mint page would send the old name
   * into a guard that no longer has it. Editing the display name of a live phase
   * therefore changes the copy only. New phases have no such constraint, which is why
   * their label is generated and never typed.
   */
  labelLocked?: boolean
}

export const emptyPhase = (): PhaseDraft => ({
  key: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  label: '',
  displayName: '',
  description: '',
  startsAt: '',
  endsAt: '',
  priceSol: '',
  maxPerWallet: '',
  allowlistRaw: '',
})

// ── Labels ────────────────────────────────────────────────────────────────────────

/**
 * Turn the name a buyer reads into the six bytes the program stores.
 *
 * Nobody should have to invent a six-byte identifier. "DawG Pound — holders" becomes
 * `DawGPo`, and the person editing the phase never sees the difference unless they look.
 *
 * ASCII only, deliberately: a byte budget is impossible to reason about when é costs two
 * and 🐕 costs four, and a label is machine-facing anyway. Non-ASCII is transliterated
 * where that is obvious (é → e) and otherwise dropped, so an all-emoji name still yields
 * something rather than an empty label.
 *
 * `taken` is every label already in use in the same save; a collision gets a numeric
 * suffix inside the budget (`DawGPo` → `DawGP2`), because two groups with one label is a
 * transaction the program rejects.
 */
export function deriveLabel(displayName: string, taken: Iterable<string> = []): string {
  const used = new Set(Array.from(taken, (t) => t.toLowerCase()))

  const ascii = displayName
    .normalize('NFKD')
    // Strip combining marks left by NFKD, so "é" is "e" rather than "e" + an accent byte.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')

  const base = (ascii || 'Phase').slice(0, LABEL_MAX_BYTES)
  if (!used.has(base.toLowerCase())) return base

  for (let n = 2; n < 1000; n++) {
    const suffix = String(n)
    const candidate = base.slice(0, Math.max(1, LABEL_MAX_BYTES - suffix.length)) + suffix
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  // 998 phases sharing a name is not a real situation; the program caps the set long
  // before this, and returning the base lets validation report the collision plainly.
  return base
}

/**
 * Give every unlocked draft a label derived from its display name.
 *
 * Run on every edit rather than at save time, so the labels in hand are always the ones
 * that would be written — validation, the uniqueness check and the mint page's tabs all
 * read the same strings.
 */
export function withDerivedLabels(drafts: PhaseDraft[]): PhaseDraft[] {
  const taken: string[] = drafts.filter((d) => d.labelLocked && d.label.trim()).map((d) => d.label.trim())

  return drafts.map((draft) => {
    if (draft.labelLocked && draft.label.trim()) return draft
    const label = deriveLabel(draft.displayName, taken)
    taken.push(label)
    return draft.label === label ? draft : { ...draft, label }
  })
}

// ── Wallet lists ──────────────────────────────────────────────────────────────────

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export interface ParsedWallets {
  /** Valid, de-duplicated, in the order first seen. */
  wallets: string[]
  /** Entries that are not plausible addresses, with the line they came from. */
  invalid: { line: number; value: string }[]
  /** How many duplicates were dropped. */
  duplicates: number
}

/**
 * Split a pasted list into addresses.
 *
 * Accepts newlines, commas, semicolons, tabs and spaces as separators, because a list
 * arrives as whatever the client exported — a spreadsheet column, a Discord dump, JSON.
 * Order is preserved and duplicates are dropped rather than rejected: a list pasted twice
 * is a normal accident and should not be an error, but the count is reported so the
 * number on screen matches the number in the tree.
 */
export function parseWallets(raw: string): ParsedWallets {
  const wallets: string[] = []
  const invalid: { line: number; value: string }[] = []
  const seen = new Set<string>()
  let duplicates = 0

  raw.split(/\r?\n/).forEach((lineText, i) => {
    for (const token of lineText.split(/[\s,;]+/)) {
      const value = token.trim()
      if (!value) continue
      if (!BASE58.test(value)) {
        invalid.push({ line: i + 1, value })
        continue
      }
      if (seen.has(value)) {
        duplicates++
        continue
      }
      seen.add(value)
      wallets.push(value)
    }
  })

  return { wallets, invalid, duplicates }
}

/**
 * Pull wallet addresses out of whatever file someone dropped on the field.
 *
 * Snapshot tools export three shapes and a person should not have to care which they got:
 *
 *   - **JSON** — an array of addresses, an array of objects (`owner`, `wallet`, `address`,
 *     `publicKey`, `pubkey`…), or an object wrapping either under `wallets`/`holders`/
 *     `addresses`/`data`. Nested objects are walked, so a Helius or Tensor dump works
 *     without reshaping.
 *   - **CSV/TSV** — any delimiter; the header row is skipped by virtue of not being
 *     base58, and extra columns (amount, rank, mint) are ignored rather than mis-read.
 *   - **anything else** — treated as text and scanned the same way.
 *
 * In every case the rule is the same and deliberately dumb: **take every base58 token that
 * looks like an address, in order, and ignore everything else.** A parser that tried to
 * identify "the address column" would guess wrong on the one export that matters.
 *
 * Returns the parse so the caller can report what was dropped — duplicates are removed
 * here, not merely counted.
 */
export function extractWallets(text: string): ParsedWallets {
  const trimmed = text.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const strings: string[] = []
      const walk = (node: unknown, depth: number): void => {
        if (depth > 8) return
        if (typeof node === 'string') strings.push(node)
        else if (Array.isArray(node)) node.forEach((n) => walk(n, depth + 1))
        else if (node && typeof node === 'object') {
          for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1)
        }
      }
      walk(JSON.parse(trimmed), 0)
      // One per line, then through the same parser as a paste, so JSON and CSV cannot
      // disagree about validation, ordering or de-duplication.
      return parseWallets(strings.join('\n'))
    } catch {
      /**
       * Malformed JSON — a half-copied export, a truncated download — is salvaged rather
       * than rejected, by pulling every base58 run out of the raw text.
       *
       * The strict token scan below cannot do it: in `{"owner":"7xKX…"}` the braces and
       * quotes are not separators, so the whole thing is one token and matches nothing.
       * A regex over the text ignores the punctuation entirely.
       *
       * Only broken JSON takes this path, because it trades away the "line 4 is not an
       * address" report that typed input needs: here there are no lines to point at and
       * the alternative is finding nothing at all.
       */
      const runs = trimmed.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []
      if (runs.length > 0) return parseWallets(runs.join('\n'))
    }
  }

  return parseWallets(trimmed)
}

/** The merkle root the `allowList` guard will carry, as hex for display. */
export function merkleRootHex(wallets: string[]): string {
  if (wallets.length === 0) return ''
  return Buffer.from(getMerkleRoot(wallets)).toString('hex')
}

// ── Validation ────────────────────────────────────────────────────────────────────

export interface PhaseProblem {
  /** Index into the drafts array, or -1 for a problem with the set as a whole. */
  index: number
  message: string
}

/**
 * Everything the program (or the sidecar) would reject, phrased for a person, checked
 * before the wallet opens. Returning a list rather than throwing on the first one
 * matters: a form with three mistakes should show three, not make the user discover them
 * one transaction at a time.
 */
export function validatePhases(drafts: PhaseDraft[]): PhaseProblem[] {
  const problems: PhaseProblem[] = []

  if (drafts.length === 0) {
    problems.push({ index: -1, message: 'Add at least one phase, or the mint has no terms to run under.' })
  }

  const labels = new Map<string, number>()
  drafts.forEach((d, i) => {
    const label = d.label.trim()

    // The label is generated from the name (`withDerivedLabels`), so an empty one means
    // an empty name — which is what the person can actually act on.
    if (!d.displayName.trim()) {
      problems.push({ index: i, message: 'Needs a name — buyers pick a phase by it.' })
    }

    if (!label) {
      if (d.displayName.trim()) {
        problems.push({ index: i, message: 'Could not build an on-chain name from this name. Use some letters or digits in it.' })
      }
    } else {
      const bytes = new TextEncoder().encode(label).length
      if (bytes > LABEL_MAX_BYTES) {
        // Only reachable for a label read off the chain — derived ones are ASCII and cut
        // to the budget — so the advice is to rename the phase, not to retype the label.
        problems.push({
          index: i,
          message: `Its on-chain name "${label}" is ${bytes} bytes; the program allows ${LABEL_MAX_BYTES}. This phase was created elsewhere — remove it and add it again to get a valid one.`,
        })
      }
      const first = labels.get(label.toLowerCase())
      if (first !== undefined) {
        problems.push({ index: i, message: `Ends up with the same on-chain name as phase ${first + 1}. Make the two names less alike.` })
      } else {
        labels.set(label.toLowerCase(), i)
      }
    }

    if (d.displayName.length > DISPLAY_NAME_MAX) {
      problems.push({ index: i, message: `Display name is longer than ${DISPLAY_NAME_MAX} characters.` })
    }
    if (d.description.length > DESCRIPTION_MAX) {
      problems.push({ index: i, message: `Description is longer than ${DESCRIPTION_MAX} characters.` })
    }

    const start = d.startsAt ? Date.parse(d.startsAt) : null
    const end = d.endsAt ? Date.parse(d.endsAt) : null
    if (d.startsAt && Number.isNaN(start)) {
      problems.push({ index: i, message: 'Start time is not a valid date.' })
    }
    if (d.endsAt && Number.isNaN(end)) {
      problems.push({ index: i, message: 'End time is not a valid date.' })
    }
    if (start && end && !Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      problems.push({ index: i, message: 'Ends before it starts — swap the two times.' })
    }

    if (d.priceSol.trim()) {
      const price = Number(d.priceSol)
      if (!Number.isFinite(price) || price < 0) {
        problems.push({ index: i, message: 'Price must be a number of SOL, or empty for a free phase.' })
      }
    }

    if (d.maxPerWallet.trim()) {
      const limit = Number(d.maxPerWallet)
      if (!Number.isInteger(limit) || limit < 1 || limit > 65535) {
        problems.push({ index: i, message: 'Max per wallet must be a whole number from 1 to 65535, or empty for unlimited.' })
      }
    }

    if (d.allowlistRaw.trim()) {
      const { wallets, invalid } = parseWallets(d.allowlistRaw)
      if (invalid.length > 0) {
        const first = invalid[0]
        problems.push({
          index: i,
          message: `${invalid.length} entr${invalid.length === 1 ? 'y is' : 'ies are'} not a Solana address (line ${first.line}: "${first.value.slice(0, 20)}").`,
        })
      }
      if (wallets.length === 0) {
        problems.push({ index: i, message: 'Allowlist has no usable addresses. Clear it to make the phase public.' })
      }
    }
  })

  return problems
}

// ── Chain → form ──────────────────────────────────────────────────────────────────

/**
 * One group, flattened into something that survives `JSON.stringify`.
 *
 * The chain is read on the server (the status route already does it), so the editor
 * receives this rather than a `CandyGuard` — whose `Option`s, `bigint`s and `Uint8Array`s
 * do not cross that boundary. One decoder, server-side, used by both the admin console
 * and the public mint page.
 */
export interface GuardGroupSummary {
  label: string
  /** ISO, or null when the guard is absent (open from the start / open-ended). */
  startsAtIso: string | null
  endsAtIso: string | null
  priceLamports: number | null
  /** Where `solPayment` sends the price. Shown so a wrong destination is visible. */
  destination: string | null
  maxPerWallet: number | null
  /** The `mintLimit.id` in use. Null when the phase has no per-wallet cap. */
  mintLimitId: number | null
  /** Hex root of the `allowList` guard, or null for a public phase. */
  allowlistRootHex: string | null
}

const iso = (unixSeconds: bigint | number): string => new Date(Number(unixSeconds) * 1000).toISOString()

/** Flatten the live guard's groups. Server-side — see `GuardGroupSummary`. */
export function summariseGroups(guard: CandyGuard | null): GuardGroupSummary[] {
  if (!guard) return []
  return guard.groups.map((group) => {
    const g = group.guards
    return {
      label: group.label,
      startsAtIso: g.startDate.__option === 'Some' ? iso(g.startDate.value.date) : null,
      endsAtIso: g.endDate.__option === 'Some' ? iso(g.endDate.value.date) : null,
      priceLamports:
        g.solPayment.__option === 'Some' ? Number(g.solPayment.value.lamports.basisPoints) : null,
      destination: g.solPayment.__option === 'Some' ? g.solPayment.value.destination.toString() : null,
      maxPerWallet: g.mintLimit.__option === 'Some' ? Number(g.mintLimit.value.limit) : null,
      mintLimitId: g.mintLimit.__option === 'Some' ? Number(g.mintLimit.value.id) : null,
      allowlistRootHex:
        g.allowList.__option === 'Some'
          ? Buffer.from(g.allowList.value.merkleRoot).toString('hex')
          : null,
    }
  })
}

/** A `datetime-local` input needs local time with no zone suffix. */
function toLocalInput(isoString: string | null): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface PhaseMeta {
  label: string
  displayName: string | null
  description: string | null
}

/**
 * Turn what the chain and the sidecar say into editable drafts.
 *
 * The allowlist is the one thing the chain cannot give back — only its root is stored.
 * `knownLists` supplies the wallets for a root the sidecar holds (keyed by root hex);
 * anything else comes back as an empty list with `unknownRootHex` set, so the editor can
 * say "this phase has an allowlist we do not hold" instead of silently presenting it as
 * public and wiping it on the next save.
 */
export function phasesFromChain(
  groups: GuardGroupSummary[],
  knownLists: Record<string, string[]> = {},
  meta: PhaseMeta[] = [],
): PhaseDraft[] {
  const byLabel = new Map(meta.map((m) => [m.label, m]))

  return groups.map((group, i) => {
    const draft = emptyPhase()
    draft.key = `chain-${i}-${group.label}`
    draft.label = group.label
    // Live on chain: keep this label whatever happens to the display name, or renaming a
    // phase in the panel silently invalidates a mint someone is in the middle of.
    draft.labelLocked = true
    // Falls back to the label so a phase whose copy was never saved still has a name in
    // the field — otherwise the editor would look like it lost it, and saving would
    // derive a different label from an empty name.
    draft.displayName = byLabel.get(group.label)?.displayName ?? group.label
    draft.description = byLabel.get(group.label)?.description ?? ''
    draft.startsAt = toLocalInput(group.startsAtIso)
    draft.endsAt = toLocalInput(group.endsAtIso)
    // Lamports → SOL for the input. `0` stays empty: a free phase has no solPayment
    // guard at all, and writing "0" back would read as a price someone chose.
    draft.priceSol = group.priceLamports ? String(group.priceLamports / 1e9) : ''
    draft.maxPerWallet = group.maxPerWallet != null ? String(group.maxPerWallet) : ''
    if (group.mintLimitId != null) draft.mintLimitId = group.mintLimitId

    if (group.allowlistRootHex) {
      const known = knownLists[group.allowlistRootHex]
      if (known && known.length > 0) draft.allowlistRaw = known.join('\n')
      else draft.unknownRootHex = group.allowlistRootHex
    }

    return draft
  })
}

// ── Form → chain ──────────────────────────────────────────────────────────────────

/**
 * Build one group's guard args.
 *
 * `mintLimitId` is passed in rather than derived here, because the caller owns the
 * decision that an existing phase keeps the id its counters hang off (gotcha 2).
 */
export function toGuardGroup(
  draft: PhaseDraft,
  mintLimitId: number,
): GuardGroupArgs<DefaultGuardSetArgs> {
  const guards: Partial<DefaultGuardSetArgs> = {}

  if (draft.startsAt) guards.startDate = some({ date: dateTime(new Date(draft.startsAt)) })
  else guards.startDate = none()

  if (draft.endsAt) guards.endDate = some({ date: dateTime(new Date(draft.endsAt)) })
  else guards.endDate = none()

  const price = Number(draft.priceSol)
  if (draft.priceSol.trim() && Number.isFinite(price) && price > 0) {
    // One destination only — the creator. The platform fee rides along as a separate
    // transferSol in the same transaction (see Frontend/lib/guardianz/mint.ts).
    guards.solPayment = some({ lamports: sol(price), destination: publicKey(CREATOR_WALLET) })
  } else {
    guards.solPayment = none()
  }

  const limit = Number(draft.maxPerWallet)
  if (draft.maxPerWallet.trim() && Number.isInteger(limit) && limit > 0) {
    guards.mintLimit = some({ id: mintLimitId, limit })
  } else {
    guards.mintLimit = none()
  }

  const { wallets } = parseWallets(draft.allowlistRaw)
  if (wallets.length > 0) {
    guards.allowList = some({ merkleRoot: getMerkleRoot(wallets) })
  } else if (draft.unknownRootHex) {
    guards.allowList = some({ merkleRoot: Uint8Array.from(Buffer.from(draft.unknownRootHex, 'hex')) })
  } else {
    guards.allowList = none()
  }

  return { label: draft.label.trim(), guards }
}

/**
 * Give every phase a `mintLimit.id`: the one it already has, or the lowest id nobody else
 * in the set is using.
 *
 * Carrying existing ids is the whole point (gotcha 2). Allocating low-and-unused for new
 * phases keeps ids inside the u8 range without ever colliding with a live counter in the
 * same save.
 */
export function assignMintLimitIds(drafts: PhaseDraft[]): number[] {
  const taken = new Set(drafts.map((d) => d.mintLimitId).filter((id): id is number => id != null))
  let next = 0
  return drafts.map((d) => {
    if (d.mintLimitId != null) return d.mintLimitId
    while (taken.has(next) && next <= MAX_MINT_LIMIT_ID) next++
    const id = Math.min(next, MAX_MINT_LIMIT_ID)
    taken.add(id)
    return id
  })
}

export interface SavePhasesResult {
  signature: string
  /** root hex → wallets, for every phase that has a list, so the sidecar can store them. */
  lists: Record<string, string[]>
  /** The ids actually written, so the caller can fold them back into its drafts. */
  mintLimitIds: number[]
}

/**
 * Write the phases on-chain. One transaction, effective immediately.
 *
 * The default guard set is deliberately emptied — see gotcha 5.
 */
export async function savePhases(
  umi: Umi,
  candyGuard: string,
  drafts: PhaseDraft[],
): Promise<SavePhasesResult> {
  const problems = validatePhases(drafts)
  if (problems.length > 0) {
    throw new Error(problems[0].index >= 0 ? `Phase ${problems[0].index + 1}: ${problems[0].message}` : problems[0].message)
  }

  const mintLimitIds = assignMintLimitIds(drafts)
  const groups = drafts.map((d, i) => toGuardGroup(d, mintLimitIds[i]))

  const lists: Record<string, string[]> = {}
  drafts.forEach((d) => {
    const { wallets } = parseWallets(d.allowlistRaw)
    if (wallets.length > 0) lists[merkleRootHex(wallets)] = wallets
  })

  // `groups` is a plain array here, not an `Option` — the hooked `updateCandyGuard`
  // takes `CandyGuardDataArgs`, and an empty array is the "no groups, default set only"
  // state (gotcha 4).
  const { signature } = await updateCandyGuard(umi, {
    candyGuard: publicKey(candyGuard),
    guards: {},
    groups,
  }).sendAndConfirm(umi)

  return { signature: base58.deserialize(signature)[0], lists, mintLimitIds }
}

/** The account that must sign `updateCandyGuard`. Read, never assumed. */
export const guardAuthority = (guard: CandyGuard | null): string | null =>
  guard ? guard.authority.toString() : null
