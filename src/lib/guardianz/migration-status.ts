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
import { readUmi } from '@/lib/guardianz/umi'

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
  priceLamports: number | null
}

export interface MigrationStatus {
  fetchedAt: string
  rpcOk: boolean
  error: string | null

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
    collection,
    candyMachine,
    gates,
    ready: gates.every(g => g.state === 'pass'),
  }
}
