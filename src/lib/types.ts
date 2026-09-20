export type CollectionStatus =
  | 'draft'
  | 'preparing'
  | 'ready'
  | 'minting'
  | 'completed'
  | 'paused'

export type TransactionStatus = 'pending' | 'confirming' | 'confirmed' | 'failed'

export interface Collection {
  id: string
  slug: string
  name: string
  description: string
  imageUrl: string
  bannerUrl?: string
  creator: string
  creatorAddress: string
  blockchain: string
  totalSupply: number
  minted: number
  price?: number
  status: CollectionStatus
  effectiveStatus: CollectionStatus
  featured: boolean
  featuredRank?: number | null
  mintStart?: string
  endDate?: string
  mintAddress?: string
  txSignature?: string
  royaltyBasisPoints?: number
  /** Flat platform fee per NFT in lamports, frozen on-chain at creation. */
  platformFeeLamports?: number
  twitterUrl?: string
  discordUrl?: string
  websiteUrl?: string
  phases?: Record<string, unknown>[]
  fundReceivers?: Record<string, unknown>[]
  traits?: Record<string, unknown>[]
  createdAt: string
  updatedAt: string
}

export interface AdminStats {
  totalCollections: number
  activeCollections: number
  totalMinted: number
  uniqueCreators: number
  featuredCount: number
  newLast7Days: number
  totalFeeRevenue: number
}

export interface Creator {
  creatorAddress: string
  displayName: string
  collectionCount: number
  totalMinted: number
  feeRevenue: number
  lastActivityAt: string
}

// ── Owner-console auth / RBAC ────────────────────────────────────────────────
export type AdminRole = 'super_admin' | 'finance' | 'moderator' | 'read_only'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: AdminRole
  /** A new login email waiting for its verification link to be clicked (GET /me). */
  pendingEmail?: string | null
  passwordChangedAt?: string | null
  lastLoginAt?: string | null
}

export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: AdminRole
  disabled: boolean
  lastLoginAt?: string | null
  pendingEmail?: string | null
  passwordChangedAt?: string | null
  createdAt: string
  updatedAt: string
}

// ── Revenue reporting ────────────────────────────────────────────────────────
export interface RevenueSummary {
  allTimeRevenue: number
  last24h: number
  last7d: number
  last30d: number
  ledgerAllTime: number
  totalMinted: number
  paidCollections: number
  freeCollections: number
  treasuryWallet: string
  treasuryBalance: number | null
  expectedAccrued: number
  treasuryDrift: number | null
  /** Flat per-NFT fee applied to rows with no stored rate — lamports and SOL. */
  defaultFeeLamports: number
  defaultFeeSol: number
}

export interface RevenueByCollectionRow {
  id: string
  name: string
  slug: string
  mintAddress?: string
  creatorAddress: string
  creator: string
  minted: number
  totalSupply: number
  price: number | null
  platformFeeLamports: number
  feeRevenue: number
}

export interface RevenueByCreatorRow {
  creatorAddress: string
  displayName: string
  collectionCount: number
  totalMinted: number
  feeRevenue: number
}

export interface RevenueTimeseriesPoint {
  bucket: string
  feeRevenue: number
  minted: number
}

// ── Audit log ────────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string
  actorId?: string
  actorEmail?: string
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  txSignature?: string
  ip?: string
  createdAt: string
}

// ── Infrastructure / platform config ─────────────────────────────────────────
// Shapes mirror the backend responses exactly; see the referenced sources when
// changing anything here.

/** GET /health — Backend/src/health/health.controller.ts. Always HTTP 200; read `status`. */
export interface HealthReport {
  status: 'ok' | 'partial' | 'error'
  timestamp: string
  database: 'connected' | 'disconnected' | 'unknown'
  solana: 'connected' | 'disconnected' | 'unknown'
  /** Redis is fail-open, so this is observability only — it never degrades `status`. */
  redis: 'connected' | 'disconnected' | 'unknown'
  /** SMTP relay for password-reset mail. `disabled` = MAIL_TRANSPORT=log (dev). */
  mail?: 'connected' | 'disconnected' | 'disabled' | 'unknown'
  solanaNetwork?: string
}

/** GET /api/ipfs/health — throws 503 when the node is unreachable. */
export interface IpfsHealth {
  ready: boolean
  nodeId: string
  agentVersion: string
}

/** GET /api/solana/config — the config the whole platform keys off. */
export interface SolanaConfig {
  network: string
  rpcUrl: string
  commitment: string
  programId: string
  mplCoreProgramId: string
  allowlistProgramId?: string
  /** Flat platform fee per NFT on every mint. */
  platformFeeLamports: number
  platformFeeSol: number
  maxPlatformFeeLamports?: number
  platformWallet: string
  feeModel: string
  feeType?: 'flat' | 'percent'
  platformFeeSplit?: { address: string; shareBps: number }[]
}

/** GET /api/solana/network — live RPC introspection. */
export interface SolanaNetwork {
  network: string
  rpcUrl: string
  version: string
  slot: number
  blockHeight: number
  isDevnet: boolean
}

/** GET /api/solana/contracts/status — is the program actually on this chain? */
export interface ContractStatus {
  network: string
  contracts: Record<string, { programId: string; deployed: boolean }>
}

/** One page of `GET /api/collections`. Cursor-based: there is no total or page number. */
export interface CollectionsPage {
  data: Collection[]
  nextCursor: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiError {
  message: string
  code?: string
  status?: number
}

export type Permission =
  | 'collections:read'
  | 'collections:write'
  | 'creators:read'
  | 'infrastructure:read'
  | 'settings:read'
  | 'settings:write'
  | 'logs:read'
  | 'users:read'
  | 'users:write'
  | 'api_keys:manage'
  | 'revenue:read'
