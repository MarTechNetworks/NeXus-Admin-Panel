/**
 * read-state.ts — one round trip that answers "what is on chain right now?"
 *
 * Everything the console shows comes from here: the registry singleton, the
 * global platform fee config, and every collection the registry knows about.
 * The DB is used for nothing but names and thumbnails — if the two ever
 * disagree, the chain is what gets edited and what gets displayed.
 */
import { PublicKey, type Connection } from '@solana/web3.js'
import { getChainConfig, getConnection } from '../solana/chain-config'
import {
  COLLECTION_ACCOUNT_SIZE,
  LEGACY_COLLECTION_ACCOUNT_SIZE,
  accounts,
  decodeCollection,
  deriveRegistryPda,
  derivePlatformFeeConfigPda,
  getProgram,
} from '../solana/program'
import type {
  AuthoritySnapshot,
  CollectionSnapshot,
  PlatformFeeConfigSnapshot,
  RegistrySnapshot,
  UnreadableCollection,
} from './types'

/** getMultipleAccounts caps a single request at 100 keys. */
const ACCOUNTS_PER_RPC = 100
/** Offset of `Collection.mint` — 8-byte discriminator + `authority`. Stable across layouts. */
const MINT_OFFSET = 8 + 32

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

  const { collections, unreadable } = registry?.collections.length
    ? await loadCollections(connection, program, registry.collections, meta)
    : { collections: [], unreadable: [] }

  return {
    programId: cfg.programId,
    registryPda: registryPda.toBase58(),
    platformFeeConfigPda: platformFeeConfigPda.toBase58(),
    registry,
    feeConfig,
    collections,
    unreadableCollections: unreadable,
    backendFeeLamports: cfg.platformFeeLamports,
    backendPlatformWallet: cfg.platformWallet,
    network: cfg.network,
    fetchedAt: Date.now(),
  }
}

/**
 * Why not `program.account.collection.fetchMultiple`: it decodes the batch as a
 * unit, so one account from before a layout change throws and the console shows
 * nothing at all. Fetching raw and decoding one by one turns that into a row in
 * `unreadable` instead — the operator sees what is on chain and why it is inert.
 */
async function loadCollections(
  connection: Connection,
  program: ReturnType<typeof getProgram>,
  pdas: string[],
  meta: CollectionMetaByMint,
): Promise<{ collections: CollectionSnapshot[]; unreadable: UnreadableCollection[] }> {
  const keys = pdas.map((p) => new PublicKey(p))
  // A registry at the 300 cap is 3 RPC calls.
  const infos = await Promise.all(
    Array.from({ length: Math.ceil(keys.length / ACCOUNTS_PER_RPC) }, (_, i) =>
      connection.getMultipleAccountsInfo(keys.slice(i * ACCOUNTS_PER_RPC, (i + 1) * ACCOUNTS_PER_RPC)),
    ),
  ).then((chunks) => chunks.flat())

  const collections: CollectionSnapshot[] = []
  const unreadable: UnreadableCollection[] = []
  infos.forEach((account, i) => {
    // A null row means the registry still lists an account that was closed or
    // never finished initializing. Skip it rather than rendering a broken line.
    if (!account) return
    const pda = keys[i].toBase58()

    try {
      const row = decodeCollection(program, account.data)
      const mint = row.mint.toBase58()
      const info = meta[mint] ?? {}
      collections.push({
        pda,
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
    } catch (e) {
      const dataLength = account.data.length
      const mint =
        dataLength >= MINT_OFFSET + 32
          ? new PublicKey(account.data.subarray(MINT_OFFSET, MINT_OFFSET + 32)).toBase58()
          : null
      const info = (mint && meta[mint]) || {}
      unreadable.push({
        pda,
        mint,
        dataLength,
        reason: describeDecodeFailure(dataLength, e),
        name: info.name,
        slug: info.slug,
      })
    }
  })

  // Most-recently-registered first mirrors the order the registry appends in.
  return { collections: collections.reverse(), unreadable: unreadable.reverse() }
}

function describeDecodeFailure(dataLength: number, error: unknown): string {
  if (dataLength === LEGACY_COLLECTION_ACCOUNT_SIZE) {
    return `${dataLength} bytes — created under the previous program build (percentage platform fee). The current program cannot deserialize it.`
  }
  const detail = error instanceof Error ? error.message : String(error)
  return `${dataLength} bytes (current layout is ${COLLECTION_ACCOUNT_SIZE}) — ${detail}`
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
