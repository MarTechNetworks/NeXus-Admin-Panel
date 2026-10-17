/**
 * The creator's signatures — the two on-chain actions only `Fbfr8aJG…` can perform.
 *
 * Both were rehearsed against a byte-for-byte clone of the mainnet collection in
 * `programs/tests/guardianz-candy-machine.test.mjs`, and the first was additionally
 * simulated against live mainnet state before a line of this file was written.
 *
 *   1. `reclaimUpdateDelegate` — the collection's UpdateDelegate plugin is currently
 *      held by LaunchMyNFT's config PDA. As update authority, the creator can revoke
 *      that in one instruction; the plugin's authority falls back to him. Without this
 *      the candy machine cannot be attached to the collection.
 *
 *   2. `createCandyMachine` — creates the Core Candy Machine + Candy Guard against the
 *      existing collection. The creator signs as `collectionUpdateAuthority` (Core
 *      requires it) **and as payer**, so the ~0.55 SOL rent deposit goes from his wallet
 *      straight into the candy machine account. Nobody holds it in between, and it is
 *      his to withdraw when the mint is done.
 *
 * Deliberately NOT here as a button: thawing the collection. The freeze is a setting
 * the creator chose on the original mint, and LaunchMyNFT's dashboard can still lift it
 * as long as their PDA keeps the freeze authority — which nothing here touches. The
 * on-chain fallback is exported below for the day their button turns out not to work,
 * but it is his call to make, not a step in our flow.
 */
import {
  addCollectionPlugin,
  revokeCollectionPluginAuthority,
  updateCollectionPlugin,
} from '@metaplex-foundation/mpl-core'
import {
  create as createCm,
  findCandyGuardPda,
  setCandyGuardAuthority,
  setCandyMachineAuthority,
} from '@metaplex-foundation/mpl-core-candy-machine'
import { generateSigner, publicKey, sol, some, type Umi } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'

import {
  GUARDIANZ_COLLECTION,
  METADATA_BASE,
  ORIGINAL_PRICE_LAMPORTS,
  CREATOR_WALLET,
} from '@/lib/guardianz/constants'
import { OPS_WALLET } from '@/lib/guardianz/candy-machine'

const COLLECTION = publicKey(GUARDIANZ_COLLECTION)

export interface ActionResult {
  signature: string
}

/** Step 1 — take the UpdateDelegate plugin back from LaunchMyNFT. */
export async function reclaimUpdateDelegate(umi: Umi): Promise<ActionResult> {
  const { signature } = await revokeCollectionPluginAuthority(umi, {
    collection: COLLECTION,
    plugin: { type: 'UpdateDelegate' },
  }).sendAndConfirm(umi)
  return { signature: toBase58(signature) }
}

export interface CreateCandyMachineParams {
  /** Remaining supply — the number of config lines that will be uploaded. */
  itemsAvailable: number
  /** Mint price in lamports; defaults to the original 0.25 SOL. */
  priceLamports?: number
}

/**
 * Step 2 — create the candy machine, paid for and authorised by the creator.
 *
 * The candy machine keypair is generated in the browser and discarded after signing;
 * it only ever signs its own creation.
 *
 * The machine is created with the **creator** as its authority, then handed to our ops
 * wallet in the same transaction. It cannot be created with ops as authority directly:
 * Candy Guard's `wrap` (part of `create`) must be signed by the machine's authority, and
 * only the creator is signing here. Mainnet simulation caught that — the local
 * rehearsal had the creator as operator, so it never saw it. One signature either way;
 * ops ends up able to upload the config lines and manage guards, and the creator keeps
 * nothing he would have to be at his keyboard for.
 *
 * Verified against live mainnet by `scripts/guardianz-preflight.mjs`.
 */
export async function createCandyMachine(
  umi: Umi,
  params: CreateCandyMachineParams,
): Promise<ActionResult & { candyMachine: string }> {
  if (!OPS_WALLET) {
    throw new Error('NEXT_PUBLIC_GUARDIANZ_OPS_WALLET is not configured — no candy machine authority to assign.')
  }

  const candyMachine = generateSigner(umi)
  const price = params.priceLamports ?? ORIGINAL_PRICE_LAMPORTS
  const ops = publicKey(OPS_WALLET)

  const builder = await createCm(umi, {
    candyMachine,
    collection: COLLECTION,
    // The connected wallet — must be the creator, or Core rejects the collection link.
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: params.itemsAvailable,
    authority: umi.identity.publicKey,
    isMutable: true,
    configLineSettings: some({
      prefixName: '',
      nameLength: 4, // longest display name is "7573"
      prefixUri: `${METADATA_BASE}/`,
      uriLength: 9, // "7574.json"
      isSequential: false, // random reveal, chosen on-chain — same as the original mint
    }),
    guards: {
      solPayment: some({ lamports: sol(price / 1e9), destination: publicKey(CREATOR_WALLET) }),
    },
  })

  const guard = findCandyGuardPda(umi, { base: candyMachine.publicKey })
  const { signature } = await builder
    .add(setCandyMachineAuthority(umi, { candyMachine: candyMachine.publicKey, newAuthority: ops }))
    .add(setCandyGuardAuthority(umi, { candyGuard: guard, newAuthority: ops }))
    .sendAndConfirm(umi)
  return { signature: toBase58(signature), candyMachine: candyMachine.publicKey }
}

export interface RoyaltySplit {
  /** Total royalty on secondary sales; 750 today. */
  basisPoints: number
  /** Whole percentages summing to 100 — Core stores each as a u8. */
  creators: { address: string; percentage: number }[]
}

/** True when the string is a Solana address — the same parse the instruction will do. */
export function isValidAddress(address: string): boolean {
  try {
    publicKey(address)
    return true
  } catch {
    return false
  }
}

/** Throws with a human message if Core would reject the split, before the wallet opens. */
export function validateRoyaltySplit(split: RoyaltySplit): void {
  if (!Number.isInteger(split.basisPoints) || split.basisPoints < 0 || split.basisPoints > 10_000) {
    throw new Error('Royalty must be between 0% and 100%, in whole basis points.')
  }
  if (split.creators.length === 0) throw new Error('At least one royalty wallet is required.')
  const seen = new Set<string>()
  for (const c of split.creators) {
    try {
      publicKey(c.address)
    } catch {
      throw new Error(`Not a valid Solana address: ${c.address || '(empty)'}`)
    }
    if (seen.has(c.address)) throw new Error('The same wallet is listed twice.')
    seen.add(c.address)
    if (!Number.isInteger(c.percentage) || c.percentage < 1) {
      throw new Error('Each wallet needs a whole-number share of at least 1%.')
    }
  }
  const total = split.creators.reduce((n, c) => n + c.percentage, 0)
  if (total !== 100) throw new Error(`Shares must add up to 100% (they add up to ${total}%).`)
}

/**
 * Rewrite the collection's Royalties plugin — e.g. split the 7.5% between two wallets.
 *
 * Every GuardianZ asset inherits royalties from the collection (none of the 1,361 has a
 * Royalties plugin of its own, checked on mainnet 2026-10-03), so this one instruction
 * changes the split on every existing NFT and on everything the candy machine mints
 * later. The plugin's authority is `UpdateAuthority`, i.e. the creator — independent of
 * the UpdateDelegate LaunchMyNFT holds, so it does not wait on step 1.
 *
 * `ruleSet` stays `None`, as it is today: no program allow/deny list on transfers.
 *
 * Adding a wallet grows the account, so the connected wallet (the payer) covers a few
 * thousand lamports of extra rent on top of the fee. Removing one shrinks it back.
 */
export async function updateRoyaltySplit(
  umi: Umi,
  split: RoyaltySplit,
  options: {
    /**
     * Pass `false` when the collection has no Royalties plugin at all — then it is
     * added rather than updated, because `updateCollectionPlugin` fails on a plugin
     * that is not there. GuardianZ has carried one since its original mint, so the
     * default is the update path; the flag just stops the editor being the thing that
     * breaks on a collection that never had royalties.
     */
    pluginExists?: boolean
  } = {},
): Promise<ActionResult> {
  validateRoyaltySplit(split)
  const plugin = {
    type: 'Royalties' as const,
    basisPoints: split.basisPoints,
    creators: split.creators.map((c) => ({ address: publicKey(c.address), percentage: c.percentage })),
    ruleSet: { type: 'None' as const },
  }
  const builder =
    options.pluginExists === false
      ? addCollectionPlugin(umi, { collection: COLLECTION, plugin })
      : updateCollectionPlugin(umi, { collection: COLLECTION, plugin })
  const { signature } = await builder.sendAndConfirm(umi)
  return { signature: toBase58(signature) }
}

/**
 * Fallback only — lift the transfer freeze without LaunchMyNFT.
 *
 * Revokes their authority on the PermanentFreezeDelegate, then flips it off. Both
 * instructions in one transaction. Not surfaced in the UI; see the file header.
 */
export async function thawCollection(umi: Umi): Promise<ActionResult> {
  const { signature } = await revokeCollectionPluginAuthority(umi, {
    collection: COLLECTION,
    plugin: { type: 'PermanentFreezeDelegate' },
  })
    .add(
      updateCollectionPlugin(umi, {
        collection: COLLECTION,
        plugin: { type: 'PermanentFreezeDelegate', frozen: false },
      }),
    )
    .sendAndConfirm(umi)
  return { signature: toBase58(signature) }
}

const toBase58 = (sig: Uint8Array): string => base58.deserialize(sig)[0]
