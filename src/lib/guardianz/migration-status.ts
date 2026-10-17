/**
 * Live migration readiness — read from mainnet, not from anyone's notes.
 *
 * The GuardianZ completion mint runs on Metaplex's Core Candy Machine (see
 * `candy-machine.ts` for why). It has three preconditions, each read straight off the
 * chain on every page load rather than tracked by hand:
 *
 *   1. reclaimed   — the collection's UpdateDelegate plugin is no longer held by
 *                    LaunchMyNFT's PDA. The creator revokes it in one signature; until
 *                    then Core will not let a candy machine attach to the collection.
 *   2. candyMachine — a Core Candy Machine exists for this collection. Created by the
 *                    creator (he signs as collection authority and pays the rent).
 *   3. loaded      — every remaining item has been uploaded as a config line. Ours to
 *                    do, 156 transactions, from the ops wallet.
 *
 * ── The freeze is deliberately NOT one of them ────────────────────────────────────
 * A PermanentFreezeDelegate gates the *transfer* lifecycle, not *create*. All 1,361
 * existing GuardianZ NFTs were minted into this collection while it was already frozen,
 * and the local rehearsal minted into the frozen clone without complaint. So minting
 * works frozen; only reselling does not. That is surfaced to buyers as a badge on the
 * mint card — a disclosure, not a precondition. Lifting it is the creator's decision
 * and LaunchMyNFT's dashboard can still do it; nothing here touches the freeze.
 *
 * A gate that cannot be evaluated reports `unknown` rather than `false`. "We could not
 * reach the RPC" and "the creator has not signed yet" are different situations, and
 * collapsing them into one red light is how a page starts lying during an outage.
 */
import { Connection, PublicKey } from '@solana/web3.js'

import {
  CREATOR_WALLET,
  GUARDIANZ_COLLECTION,
  GUARDIANZ_RPC_URL,
  LMN_CONFIG_PDA,
  TOTAL_SUPPLY,
} from '@/lib/guardianz/constants'
import {
  authorityIs,
  decodeCoreCollection,
  describeAuthority,
  type CoreCollection,
} from '@/lib/guardianz/core-account'
import { findCandyMachine } from '@/lib/guardianz/candy-machine'
import { guardAuthority, summariseGroups, type GuardGroupSummary } from '@/lib/guardianz/guard-groups'
import { readUmi } from '@/lib/guardianz/umi'
import snapshot from '@/lib/guardianz/data/snapshot.json'

/**
 * The size of the pool that will actually be uploaded.
 *
 * Imported here rather than in the console because this module only ever runs
 * server-side (the client takes `MigrationStatus` as a type-only import), so the
 * snapshot's ~370 KB stays out of the browser bundle while the number it carries
 * reaches the UI through the status payload.
 */
const SNAPSHOT_POOL_SIZE: number = snapshot.entries.length

export type GateState = 'pass' | 'fail' | 'unknown'

export interface Gate {
  id: 'reclaimed' | 'candyMachine' | 'loaded'
  label: string
  state: GateState
  detail: string
  owner: 'creator' | 'nexus'
}

/** Serialisable candy-machine summary — what the client needs to build a mint. */
export interface CandyMachineSummary {
  address: string
  authority: string
  itemsAvailable: number
  itemsLoaded: number
  itemsRedeemed: number
  fullyLoaded: boolean
  /** The default guard set's price, when there are no groups. Null once groups exist. */
  priceLamports: number | null
  /** The Candy Guard account — what `updateCandyGuard` is addressed to. */
  candyGuard: string
  /**
   * The wallet that must sign a phase edit. Read off the guard account, never assumed:
   * it is `setCandyGuardAuthority`'d to the ops wallet at creation and can be moved
   * again, and the editor gates its save button on this matching the connected wallet.
   */
  guardAuthority: string | null
  /**
   * The live mint phases, flattened for the wire. Empty means the guard has no groups
   * and the default guard set is in force — a different state from "no phases", and the
   * editor says which one it is looking at.
   */
  groups: GuardGroupSummary[]
}

export interface MigrationStatus {
  fetchedAt: string
  rpcOk: boolean
  error: string | null

  /**
   * How many config lines the candy machine must be created with — the snapshot's own
   * entry count, which is the only number that reconciles.
   *
   * NOT `totalSupply - numMinted`. Two assets have been burned, and MPL Core's
   * `num_minted` counts mints ever made and never decrements, so that subtraction says
   * 6,214 while the snapshot (built by diffing the 1,359 assets that actually exist
   * against 0…7574) holds 6,216. `itemsAvailable` is immutable after creation, so
   * creating with the smaller number orphans two files permanently — the creator would
   * have to pay a second rent deposit to fix it.
   */
  poolSize: number

  /** Live collection state. Null when the RPC call failed. */
  collection: {
    name: string
    updateAuthority: string
    updateAuthorityIsCreator: boolean
    numMinted: number
    remaining: number
    totalSupply: number
    percentMinted: number
    frozen: boolean | null
    freezeAuthority: string
    freezeHeldByLmn: boolean
    updateDelegateAuthority: string
    updateDelegateHeldByLmn: boolean
    additionalDelegates: string[]
    royaltyBps: number | null
    royaltyCreators: { address: string; percentage: number }[]
  } | null

  candyMachine: CandyMachineSummary | null
  gates: Gate[]
  /** True only when every gate passes — the single condition the mint button unlocks on. */
  ready: boolean
}

function summarise(c: CoreCollection) {
  const remaining = Math.max(0, TOTAL_SUPPLY - c.numMinted)
  return {
    name: c.name,
    updateAuthority: c.updateAuthority.toBase58(),
    updateAuthorityIsCreator: c.updateAuthority.toBase58() === CREATOR_WALLET,
    numMinted: c.numMinted,
    remaining,
    totalSupply: TOTAL_SUPPLY,
    percentMinted: Math.round((c.numMinted / TOTAL_SUPPLY) * 1000) / 10,
    frozen: c.permanentlyFrozen,
    freezeAuthority: describeAuthority(c.freezeAuthority),
    freezeHeldByLmn: authorityIs(c.freezeAuthority, LMN_CONFIG_PDA),
    updateDelegateAuthority: describeAuthority(c.updateDelegateAuthority),
    updateDelegateHeldByLmn: authorityIs(c.updateDelegateAuthority, LMN_CONFIG_PDA),
    additionalDelegates: c.additionalDelegates.map(d => d.toBase58()),
    royaltyBps: c.royalties?.basisPoints ?? null,
    royaltyCreators:
      c.royalties?.creators.map(cr => ({
        address: cr.address.toBase58(),
        percentage: cr.percentage,
      })) ?? [],
  }
}

export async function readMigrationStatus(): Promise<MigrationStatus> {
  const fetchedAt = new Date().toISOString()

  let collection: MigrationStatus['collection'] = null
  let candyMachine: CandyMachineSummary | null = null
  let rpcOk = false
  let error: string | null = null

  try {
    const connection = new Connection(GUARDIANZ_RPC_URL, 'confirmed')
    const info = await connection.getAccountInfo(new PublicKey(GUARDIANZ_COLLECTION))
    if (!info) throw new Error('Collection account not found on mainnet.')
    collection = summarise(decodeCoreCollection(Buffer.from(info.data)))
    rpcOk = true

    const cm = await findCandyMachine(readUmi())
    if (cm) {
      candyMachine = {
        address: cm.address,
        authority: cm.authority,
        itemsAvailable: cm.itemsAvailable,
        itemsLoaded: cm.itemsLoaded,
        itemsRedeemed: cm.itemsRedeemed,
        fullyLoaded: cm.fullyLoaded,
        priceLamports: cm.priceLamports,
        candyGuard: cm.candyGuard,
        guardAuthority: guardAuthority(cm.guard),
        groups: summariseGroups(cm.guard),
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const reclaimed: GateState = !collection ? 'unknown' : collection.updateDelegateHeldByLmn ? 'fail' : 'pass'
  const cmExists: GateState = !collection ? 'unknown' : candyMachine ? 'pass' : 'fail'
  const loaded: GateState = !collection ? 'unknown' : candyMachine?.fullyLoaded ? 'pass' : 'fail'

  const gates: Gate[] = [
    {
      id: 'reclaimed',
      label: 'Mint permission reclaimed from LaunchMyNFT',
      owner: 'creator',
      state: reclaimed,
      detail: !collection
        ? 'Could not read the collection.'
        : reclaimed === 'pass'
          ? `UpdateDelegate authority: ${collection.updateDelegateAuthority}.`
          : "The collection's UpdateDelegate is still held by LaunchMyNFT's PDA. One signature from the creator revokes it.",
    },
    {
      id: 'candyMachine',
      label: 'Candy machine created',
      owner: 'creator',
      state: cmExists,
      detail: !collection
        ? 'Could not read the chain.'
        : candyMachine
          ? `${candyMachine.address} — ${candyMachine.itemsAvailable.toLocaleString()} items, ` +
            `${candyMachine.priceLamports != null ? (candyMachine.priceLamports / 1e9).toFixed(2) : '?'} SOL.`
          : 'No Core Candy Machine exists for this collection yet. The creator signs its creation and pays its rent deposit.',
    },
    {
      id: 'loaded',
      label: 'Remaining items uploaded',
      owner: 'nexus',
      state: loaded,
      detail: !collection
        ? 'Could not read the chain.'
        : !candyMachine
          ? 'Waiting for the candy machine.'
          : candyMachine.fullyLoaded
            ? `${candyMachine.itemsLoaded.toLocaleString()} / ${candyMachine.itemsAvailable.toLocaleString()} config lines on-chain.`
            : `${candyMachine.itemsLoaded.toLocaleString()} / ${candyMachine.itemsAvailable.toLocaleString()} uploaded — run pnpm guardianz:upload from the admin app.`,
    },
  ]

  return {
    fetchedAt,
    rpcOk,
    error,
    poolSize: SNAPSHOT_POOL_SIZE,
    collection,
    candyMachine,
    gates,
    ready: gates.every(g => g.state === 'pass'),
  }
}
