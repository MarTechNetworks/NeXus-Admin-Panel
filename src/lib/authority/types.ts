/**
 * types.ts — the vocabulary of the on-chain authority console.
 *
 * Three shapes carry everything:
 *   Snapshot — what the chain says right now (read once, re-read after a send)
 *   Draft    — what the operator has typed (starts as a copy of the snapshot)
 *   Change   — one field that differs, tagged with the instruction that fixes it
 *
 * Changes are derived, never stored: `diffAuthority(snapshot, draft)` is the only
 * thing that decides what goes into the transaction, so what the review dialog
 * lists and what gets signed cannot drift apart.
 */

/** Every registry-authority instruction the console can emit. */
export type AuthorityIxKind =
  | 'init_platform_fee_config'
  | 'update_platform_fee_config'
  | 'update_platform_fee'
  | 'update_featured'
  | 'propose_registry_admin'
  | 'initiate_upgrade'
  | 'cancel_upgrade'
  | 'complete_upgrade'
  | 'emergency_pause_all'
  | 'emergency_unpause_all'

/** UI grouping — matches the section cards on the page. */
export type AuthorityGroup =
  | 'fees'
  | 'recipients'
  | 'collections'
  | 'emergency'
  | 'admin'
  | 'upgrade'

// ── Snapshot ─────────────────────────────────────────────────────────────────

export interface RegistrySnapshot {
  authority: string
  pendingAuthority: string | null
  emergencyPause: boolean
  emergencyPauseTime: number | null
  upgradeState: number
  pendingUpgradeProgram: string | null
  upgradeInitiatedTime: number | null
  upgradeCompletionTime: number | null
  collectionCount: number
  collections: string[]
}

export interface FeeRecipientSnapshot {
  address: string
  shareBps: number
}

export interface PlatformFeeConfigSnapshot {
  exists: boolean
  defaultFeeBps: number
  freeMintFeeLamports: string
  recipients: FeeRecipientSnapshot[]
}

export interface CollectionSnapshot {
  /** Collection PDA — the account every instruction addresses. */
  pda: string
  /** The mint seed, which is what the DB stores as mintAddress. */
  mint: string
  authority: string
  platformFeeBps: number
  featured: boolean
  status: number
  flags: number
  minted: number
  maxSupply: number
  priceLamports: string
  /** Joined from the admin API by mint address; PDA-truncated when unknown. */
  name?: string
  slug?: string
  imageUrl?: string
}

export interface AuthoritySnapshot {
  programId: string
  registryPda: string
  platformFeeConfigPda: string
  /** null when the registry has never been initialized on this cluster. */
  registry: RegistrySnapshot | null
  feeConfig: PlatformFeeConfigSnapshot
  collections: CollectionSnapshot[]
  /** Backend-reported defaults, shown as context next to the on-chain values. */
  backendFeeBps: number
  backendPlatformWallet: string
  network: string
  fetchedAt: number
}

// ── Draft ────────────────────────────────────────────────────────────────────

export interface FeeRecipientDraft {
  address: string
  /** Basis points; the four rows must total 10000. */
  shareBps: number
}

export type UpgradeAction = 'none' | 'initiate' | 'cancel' | 'complete'

export interface CollectionOverrideDraft {
  platformFeeBps: number
  featured: boolean
}

export interface AuthorityDraft {
  /** Platform cut on paid mints, in basis points (≤ 1500). */
  defaultFeeBps: number
  /** Flat fee per NFT on zero-price mints, entered in SOL. */
  freeMintFeeSol: string
  recipients: FeeRecipientDraft[]
  /**
   * Only meaningful when the PlatformFeeConfig PDA does not exist yet: creating
   * it with today's backend defaults is a real on-chain action but produces no
   * field-level diff, so it has to be opted into rather than inferred.
   */
  createFeeConfig: boolean
  emergencyPause: boolean
  /** Keyed by collection PDA. Only entries that differ become instructions. */
  collections: Record<string, CollectionOverrideDraft>
  /** '' = leave the rotation alone. */
  pendingAuthority: string
  upgrade: {
    action: UpgradeAction
    newProgramId: string
    delaySeconds: number
  }
}

// ── Diff ─────────────────────────────────────────────────────────────────────

export interface AuthorityChange {
  /** Stable identity for revert/highlight, e.g. `collection:<pda>:fee`. */
  key: string
  group: AuthorityGroup
  label: string
  before: string
  after: string
  instruction: AuthorityIxKind
  /** Set for per-collection rows so the review dialog can group them. */
  collectionPda?: string
}

export interface AuthorityIssue {
  level: 'error' | 'warning'
  group: AuthorityGroup
  message: string
  /** Field key this issue attaches to, when it maps to one input. */
  key?: string
}
