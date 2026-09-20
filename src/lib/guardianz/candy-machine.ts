/**
 * The GuardianZ completion mint runs on Metaplex's Core Candy Machine — the standard,
 * already-deployed mainnet program — not on our own launchpad program.
 *
 * Why: the launchpad only mints into collections it created and controls via its own
 * `Collection` PDA. GuardianZ is a foreign collection with a shuffled reveal (the asset
 * named "3465" points at `799.json`; there is no formula), so its 6,214 remaining
 * (name, file) pairs have to physically live on-chain. Candy Machine's config lines are
 * exactly that, with random selection built in and a battle-tested guard layer for
 * price and limits. A custom program was written, built and then discarded once this
 * proved to be cheaper, safer and already audited.
 *
 * Verified end-to-end against a byte-for-byte clone of the mainnet collection on a
 * local validator — see `programs/tests/guardianz-candy-machine.test.mjs`.
 */
import {
  fetchCandyMachine,
  getCandyMachineGpaBuilder,
  safeFetchCandyGuard,
  type CandyMachine,
  type CandyGuard,
} from '@metaplex-foundation/mpl-core-candy-machine'
import { publicKey, type Umi } from '@metaplex-foundation/umi'

import { GUARDIANZ_COLLECTION } from '@/lib/guardianz/constants'

/**
 * The candy machine's `authority` — the key allowed to upload config lines, change
 * guards and, at the end, withdraw. Our operational wallet, so the 156 upload
 * transactions can be signed by us rather than by the creator. It is *not* the payer
 * of the rent deposit; the creator pays that directly at creation, which is what makes
 * the deposit go wallet → candy machine → wallet with nobody in between.
 */
export const OPS_WALLET = process.env.NEXT_PUBLIC_GUARDIANZ_OPS_WALLET ?? ''

/**
 * Where the buyer's flat platform fee goes. Candy Guard's `solPayment` allows one
 * destination (the creator), so the fee is a separate `transferSol` in the same
 * transaction — atomic, and visible as a plain transfer on the explorer.
 */
export const PLATFORM_FEE_WALLET =
  process.env.NEXT_PUBLIC_GUARDIANZ_PLATFORM_WALLET ?? '4e5ztDKaKWZARpF7sNKXHtoC1SNwNhnFArrYuG7zhHfd'

/**
 * Flat platform fee per NFT in lamports — the same 0.01 SOL the launchpad program
 * charges, so a GuardianZ mint and a launchpad mint cost the buyer the same on top of
 * price. Overridable per environment because, unlike the launchpad, nothing on-chain
 * enforces this one; it is a plain transfer we add ourselves.
 */
export const PLATFORM_FEE_LAMPORTS = Number(
  process.env.NEXT_PUBLIC_GUARDIANZ_PLATFORM_FEE_LAMPORTS ?? 10_000_000,
)

export interface CandyMachineState {
  address: string
  authority: string
  itemsAvailable: number
  itemsLoaded: number
  itemsRedeemed: number
  /** Every config line uploaded — the precondition for minting. */
  fullyLoaded: boolean
  guard: CandyGuard | null
  /** Price the guard charges, in lamports, or null when there is no solPayment guard. */
  priceLamports: number | null
  raw: CandyMachine
}

/**
 * Find the candy machine attached to the GuardianZ collection, if one exists.
 *
 * Looked up rather than configured: a program-account query filtered on
 * `collectionMint` finds it whether or not anyone remembered to write the address down
 * after the creator signed the creation transaction. If several exist (a test run, a
 * re-do), the one with the most items loaded wins — that is the live one.
 */
export async function findCandyMachine(umi: Umi): Promise<CandyMachineState | null> {
  const all = await getCandyMachineGpaBuilder(umi)
    .whereField('collectionMint', publicKey(GUARDIANZ_COLLECTION))
    .getDeserialized()
  if (all.length === 0) return null

  const cm = all.sort((a, b) => b.itemsLoaded - a.itemsLoaded)[0]
  return toState(umi, cm)
}

export async function readCandyMachine(umi: Umi, address: string): Promise<CandyMachineState> {
  return toState(umi, await fetchCandyMachine(umi, publicKey(address)))
}

async function toState(umi: Umi, cm: CandyMachine): Promise<CandyMachineState> {
  const guard = await safeFetchCandyGuard(umi, cm.mintAuthority)
  const solPayment = guard?.guards.solPayment
  const priceLamports =
    solPayment && solPayment.__option === 'Some' ? Number(solPayment.value.lamports.basisPoints) : null
  const itemsAvailable = Number(cm.data.itemsAvailable)

  return {
    address: cm.publicKey,
    authority: cm.authority,
    itemsAvailable,
    itemsLoaded: cm.itemsLoaded,
    itemsRedeemed: Number(cm.itemsRedeemed),
    fullyLoaded: cm.itemsLoaded >= itemsAvailable,
    guard,
    priceLamports,
    raw: cm,
  }
}
