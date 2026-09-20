/**
 * read-state.ts — one round trip that answers "what is on chain right now?"
 *
 * Everything the console shows comes from here: the registry singleton, the
 * global platform fee config, and every collection the registry knows about.
 * The DB is used for nothing but names and thumbnails — if the two ever
 * disagree, the chain is what gets edited and what gets displayed.
 */
import { PublicKey } from '@solana/web3.js'
import { getChainConfig, getConnection } from '../solana/chain-config'
import {
  accounts,
  deriveRegistryPda,
  derivePlatformFeeConfigPda,
  getProgram,
} from '../solana/program'
import type {
  AuthoritySnapshot,
  CollectionSnapshot,
  PlatformFeeConfigSnapshot,
  RegistrySnapshot,
} from './types'

/** Name/image lookup keyed by mint seed address, supplied by the admin API. */
export type CollectionMetaByMint = Record<
  string,
  { name?: string; slug?: string; imageUrl?: string }
>

/** i64::MIN and friends are "disabled" sentinels, not timestamps. */
function timeOrNull(value: { toString(): string } | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value.toString())
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export async function loadAuthoritySnapshot(
  meta: CollectionMetaByMint = {},
): Promise<AuthoritySnapshot> {
  const cfg = await getChainConfig()
  const connection = getConnection(cfg)
  const programId = new PublicKey(cfg.programId)
  const program = getProgram(connection, programId)
  const ns = accounts(program)

  const registryPda = deriveRegistryPda(programId)
  const platformFeeConfigPda = derivePlatformFeeConfigPda(programId)

  const [registryRaw, feeRaw] = await Promise.all([
    ns.collectionRegistry.fetchNullable(registryPda).catch(() => null),
    ns.platformFeeConfig.fetchNullable(platformFeeConfigPda).catch(() => null),
  ])

  const registry: RegistrySnapshot | null = registryRaw
    ? {
        authority: registryRaw.authority.toBase58(),
        pendingAuthority: registryRaw.pendingAuthority?.toBase58() ?? null,
        emergencyPause: registryRaw.emergencyPause,
        emergencyPauseTime: timeOrNull(registryRaw.emergencyPauseTime),
        upgradeState: registryRaw.upgradeState,
        pendingUpgradeProgram: registryRaw.pendingUpgradeProgram.equals(PublicKey.default)
          ? null
          : registryRaw.pendingUpgradeProgram.toBase58(),
        upgradeInitiatedTime: timeOrNull(registryRaw.upgradeInitiatedTime),
        upgradeCompletionTime: timeOrNull(registryRaw.upgradeCompletionTime),
        collectionCount: registryRaw.collectionCount,
        // collection_count is authoritative; the Vec can carry trailing slots.
        collections: registryRaw.collections
          .slice(0, registryRaw.collectionCount)
          .map((k) => k.toBase58()),
      }
    : null

  const feeConfig: PlatformFeeConfigSnapshot = feeRaw
    ? {
        exists: true,
        feeLamports: feeRaw.feeLamports.toString(),
        recipients: feeRaw.recipients.slice(0, feeRaw.num).map((address, i) => ({
          address: address.toBase58(),
          shareBps: feeRaw.sharesBps[i] ?? 0,
        })),
      }
    : {
        // No PDA yet: seed the form from what the backend serves so the first
        // write reproduces current behaviour instead of resetting it.
        exists: false,
        feeLamports: String(cfg.platformFeeLamports ?? 0),
        recipients:
          cfg.platformFeeSplit?.map((r) => ({ address: r.address, shareBps: r.shareBps })) ??
          (cfg.platformWallet ? [{ address: cfg.platformWallet, shareBps: 10_000 }] : []),
      }

  const collections = registry?.collections.length
    ? await loadCollections(program, registry.collections, meta)
    : []

  return {
    programId: cfg.programId,
    registryPda: registryPda.toBase58(),
    platformFeeConfigPda: platformFeeConfigPda.toBase58(),
    registry,
    feeConfig,
    collections,
    backendFeeLamports: cfg.platformFeeLamports,
    backendPlatformWallet: cfg.platformWallet,
    network: cfg.network,
    fetchedAt: Date.now(),
  }
}

async function loadCollections(
  program: ReturnType<typeof getProgram>,
  pdas: string[],
  meta: CollectionMetaByMint,
): Promise<CollectionSnapshot[]> {
  const keys = pdas.map((p) => new PublicKey(p))
  // fetchMultiple chunks internally; a registry at the 300 cap is 4 RPC calls.
  const rows = await accounts(program).collection.fetchMultiple(keys)

  const out: CollectionSnapshot[] = []
  rows.forEach((row, i) => {
    // A null row means the registry still lists an account that was closed or
    // never finished initializing. Skip it rather than rendering a broken line.
    if (!row) return
    const mint = row.mint.toBase58()
    const info = meta[mint] ?? {}
    out.push({
      pda: keys[i].toBase58(),
      mint,
      authority: row.authority.toBase58(),
      platformFeeLamports: row.platformFeeLamports.toString(),
      featured: row.featured,
      status: row.status,
      flags: row.flags,
      minted: Number(row.minted.toString()),
      maxSupply: Number(row.maxSupply.toString()),
      priceLamports: row.price.toString(),
      name: info.name,
      slug: info.slug,
      imageUrl: info.imageUrl,
    })
  })

  // Most-recently-registered first mirrors the order the registry appends in.
  return out.reverse()
}

/**
 * Rent-exemption pre-flight for fee recipients.
 *
 * `write_platform_fee_config` rejects any recipient whose account balance is
 * below the rent-exempt minimum, and it does so for the whole transaction. That
 * failure only shows up after the operator has already signed, so check it here
 * and surface the bad address while it is still editable.
 */
export async function checkRecipientsRentExempt(
  addresses: string[],
): Promise<{ address: string; lamports: number; rentExempt: boolean }[]> {
  if (addresses.length === 0) return []
  const cfg = await getChainConfig()
  const connection = getConnection(cfg)
  const keys = addresses.map((a) => new PublicKey(a))
  const infos = await connection.getMultipleAccountsInfo(keys)

  // Ask the cluster for the real minimum per distinct data length — a plain
  // wallet is 0 bytes, but a PDA or token account used as a fee sink is not, and
  // guessing the rate would put the pre-flight out of step with the runtime.
  const sizes = new Set<number>([0, ...infos.map((info) => info?.data.length ?? 0)])
  const minimums = new Map<number, number>()
  await Promise.all(
    [...sizes].map(async (size) => {
      minimums.set(size, await connection.getMinimumBalanceForRentExemption(size))
    }),
  )

  return addresses.map((address, i) => {
    const info = infos[i]
    // A non-existent account has zero lamports, which is never rent exempt.
    if (!info) return { address, lamports: 0, rentExempt: false }
    const minimum = minimums.get(info.data.length) ?? minimums.get(0) ?? 0
    return {
      address,
      lamports: info.lamports,
      rentExempt: info.lamports >= minimum,
    }
  })
}
